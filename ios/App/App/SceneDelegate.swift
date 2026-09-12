import UIKit
import WebKit
import Capacitor

let brumeWebAppReady = Notification.Name("BrumeWebAppReady")

/// Native loading screen drawn on top of everything (window level), so it is
/// visible from the very first frame after the launch screen and cannot be
/// replaced by whatever view controller Capacitor installs.
final class BrumeLoadingOverlay: UIView {
    private static weak var current: BrumeLoadingOverlay?
    private static var dismissed = false

    static let champagne = UIColor(red: 1.0, green: 0.894, blue: 0.616, alpha: 1.0)

    @discardableResult
    static func install(on window: UIWindow) -> BrumeLoadingOverlay? {
        if dismissed { return nil }
        if let existing = current, existing.superview != nil {
            existing.superview?.bringSubviewToFront(existing)
            return existing
        }
        let overlay = BrumeLoadingOverlay(frame: window.bounds)
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        overlay.build()
        window.addSubview(overlay)
        window.bringSubviewToFront(overlay)
        current = overlay
        return overlay
    }

    static func dismiss() {
        DispatchQueue.main.async {
            dismissed = true
            guard let overlay = current else { return }
            UIView.animate(withDuration: 0.3, animations: {
                overlay.alpha = 0
            }, completion: { _ in
                overlay.removeFromSuperview()
                current = nil
            })
        }
    }

    private func build() {
        backgroundColor = .black
        isUserInteractionEnabled = true

        let spinner = UIActivityIndicatorView(style: .large)
        spinner.color = BrumeLoadingOverlay.champagne
        spinner.startAnimating()

        let label = UILabel()
        label.textAlignment = .center
        label.attributedText = NSAttributedString(
            string: "Opening Brume 24/7",
            attributes: [
                .kern: 3.0,
                .foregroundColor: BrumeLoadingOverlay.champagne,
                .font: UIFont(name: "Georgia", size: 15) ?? UIFont.systemFont(ofSize: 15)
            ]
        )

        let stack = UIStackView(arrangedSubviews: [spinner, label])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 22
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor)
        ])
    }
}

/// Bridge controller that reports when the remote web app has finished loading.
class BrumeBridgeViewController: CAPBridgeViewController {
    private var progressObservation: NSKeyValueObservation?
    private var loadingObservation: NSKeyValueObservation?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        observeWebView()
        // Safety net: never trap the user behind the overlay.
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
            BrumeLoadingOverlay.dismiss()
        }
    }

    private func observeWebView() {
        guard let webView = self.webView as? WKWebView else { return }
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { _, change in
            if let value = change.newValue, value >= 0.95 {
                NotificationCenter.default.post(name: brumeWebAppReady, object: nil)
            }
        }
        loadingObservation = webView.observe(\.isLoading, options: [.new]) { web, change in
            if change.newValue == false, web.estimatedProgress > 0 {
                NotificationCenter.default.post(name: brumeWebAppReady, object: nil)
            }
        }
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        NotificationCenter.default.addObserver(
            forName: brumeWebAppReady,
            object: nil,
            queue: .main
        ) { _ in
            // Give the first painted frame a moment before fading out.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                BrumeLoadingOverlay.dismiss()
            }
        }

        guard let windowScene = scene as? UIWindowScene else { return }
        installOverlay(in: windowScene)
        // The bridge window can be created slightly later; keep it covered.
        for delay in [0.0, 0.05, 0.2, 0.5, 1.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak windowScene] in
                guard let windowScene = windowScene else { return }
                self.installOverlay(in: windowScene)
            }
        }
    }

    private func installOverlay(in windowScene: UIWindowScene) {
        let target = windowScene.windows.first(where: { $0.isKeyWindow }) ?? windowScene.windows.first ?? window
        guard let target = target else { return }
        BrumeLoadingOverlay.install(on: target)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
