import AppTrackingTransparency
import Capacitor
import UIKit

@objc(ATTPlugin)
public class ATTPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ATTPlugin"
    public let jsName = "ATT"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)
    ]

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(["status": Self.string(ATTrackingManager.trackingAuthorizationStatus)])
    }

    @objc func request(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard UIApplication.shared.applicationState == .active else {
                call.resolve(["status": "notDetermined"])
                return
            }
            guard ATTrackingManager.trackingAuthorizationStatus == .notDetermined else {
                call.resolve(["status": Self.string(ATTrackingManager.trackingAuthorizationStatus)])
                return
            }
            ATTrackingManager.requestTrackingAuthorization { status in
                DispatchQueue.main.async { call.resolve(["status": Self.string(status)]) }
            }
        }
    }

    private static func string(_ status: ATTrackingManager.AuthorizationStatus) -> String {
        switch status {
        case .notDetermined: return "notDetermined"
        case .restricted: return "restricted"
        case .denied: return "denied"
        case .authorized: return "authorized"
        @unknown default: return "unknown"
        }
    }
}