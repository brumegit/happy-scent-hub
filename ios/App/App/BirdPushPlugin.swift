import BirdKit
import Capacitor
import UIKit
import UserNotifications

/// Single Bird SDK instance for the app. Reads the `Bird` dictionary in Info.plist.
enum BrumeBird {
    static var lastError: String?
    static var tokenRegistered = false

    static let shared: Bird? = {
        do {
            return try Bird()
        } catch {
            lastError = "Bird init failed: \(error)"
            NSLog("[BirdPush] %@", lastError ?? "")
            return nil
        }
    }()

    static func register(token: Data) {
        guard let bird = shared else { return }
        bird.notifications.registerDevice(deviceToken: token)
        tokenRegistered = true
        lastError = nil
    }

    /// Re-requests the APNs token whenever notifications are allowed (Apple
    /// recommends doing this every launch; the token can change).
    static func refreshTokenIfAllowed() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            guard allowed(settings.authorizationStatus) else { return }
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    static func allowed(_ status: UNAuthorizationStatus) -> Bool {
        switch status {
        case .authorized, .provisional, .ephemeral: return true
        default: return false
        }
    }

    static func permissionString(_ status: UNAuthorizationStatus) -> String {
        if allowed(status) { return "granted" }
        switch status {
        case .denied: return "denied"
        case .notDetermined: return "prompt"
        default: return "unknown"
        }
    }

    static func setSubscribed(_ subscribed: Bool) {
        shared?.contact.putAttributes(attributes: Attributes().put("subscribedPush", subscribed))
    }
}

/// JS name "BirdPush": permission prompt, Bird contact linking, push taps.
@objc(BirdPushPlugin)
public class BirdPushPlugin: CAPPlugin, CAPBridgedPlugin, NotificationHandlerProtocol {
    public let identifier = "BirdPushPlugin"
    public let jsName = "BirdPush"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise)
    ]

    private static let externalIdKey = "brume-bird-external-id"

    override public func load() {
        _ = BrumeBird.shared
        // Capacitor owns the notification center delegate; it hands remote
        // pushes (banner while open, taps) to this handler.
        bridge?.notificationRouter.pushNotificationHandler = self
    }

    private func resolveStatus(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            var result: [String: Any] = [
                "permission": BrumeBird.permissionString(settings.authorizationStatus),
                "registered": BrumeBird.tokenRegistered,
                "birdReady": BrumeBird.shared != nil
            ]
            if let error = BrumeBird.lastError { result["error"] = error }
            call.resolve(result)
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        resolveStatus(call)
    }

    @objc func request(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            BrumeBird.setSubscribed(granted)
            if granted {
                DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
            }
            // Give APNs a moment so the returned status can already say "registered".
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { self.resolveStatus(call) }
        }
    }

    @objc func sync(_ call: CAPPluginCall) {
        if let externalId = call.getString("externalId"), !externalId.isEmpty,
           UserDefaults.standard.string(forKey: Self.externalIdKey) != externalId {
            BrumeBird.shared?.contact.identify(externalid: externalId)
            UserDefaults.standard.set(externalId, forKey: Self.externalIdKey)
        }
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let allowed = BrumeBird.allowed(settings.authorizationStatus)
            if settings.authorizationStatus != .notDetermined { BrumeBird.setSubscribed(allowed) }
            if allowed {
                DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
            }
            self.resolveStatus(call)
        }
    }

    // MARK: NotificationHandlerProtocol (remote pushes only)

    public func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        if let bird = BrumeBird.shared {
            return bird.notifications.willPresentNotification(notification)
        }
        return [.banner, .sound, .list]
    }

    public func didReceive(response: UNNotificationResponse) {
        guard let bird = BrumeBird.shared,
              let result = bird.notifications.handleNotificationResponse(
                response: response, automaticallyOpenDeeplinks: false),
              let url = result.action.url else { return }
        open(url)
    }

    /// brume.me pages open inside the app (same rule as allowNavigation);
    /// anything else goes to the system.
    private func open(_ url: URL) {
        let host = url.host ?? ""
        let inApp = host == "brume.me" || host.hasSuffix(".brume.me")
        DispatchQueue.main.async {
            guard inApp, let webView = self.bridge?.webView else {
                UIApplication.shared.open(url)
                return
            }
            // On a cold start the app page may still be loading; let it finish first.
            let delay: Double = webView.isLoading ? 1.5 : 0
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                webView.load(URLRequest(url: url))
            }
        }
    }
}
