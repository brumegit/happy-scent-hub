import UIKit
import WebKit
import Capacitor

/// The native shell loads the published web app from a remote URL, so the
/// local `native-shell/index.html` splash is never displayed. This bridge
/// controller draws the loading state natively on top of the webview and
/// removes it once the remote app has finished loading.
class BrumeBridgeViewController: CAPBridgeViewController {
    private let overlay = UIView()
    private var progressObservation: NSKeyValueObservation?
    private var loadingObservation: NSKeyValueObservation?
    private var dismissed = false

    override func viewDidLoad() {
        super.viewDidLoad()
        installOverlay()
        observeWebView()
        // Safety net: never trap the user behind the overlay.
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in
            self?.dismissOverlay()
        }
    }

    private func installOverlay() {
        overlay.backgroundColor = UIColor.black
        overlay.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(overlay)
        NSLayoutConstraint.activate([
            overlay.topAnchor.constraint(equalTo: view.topAnchor),
            overlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])

        let champagne = UIColor(red: 1.0, green: 0.894, blue: 0.616, alpha: 1.0)

        let spinner = UIActivityIndicatorView(style: .large)
        spinner.color = champagne
        spinner.startAnimating()
        spinner.translatesAutoresizingMaskIntoConstraints = false

        let label = UILabel()
        label.text = "Opening Brume 24/7"
        label.textColor = champagne
        label.font = UIFont(name: "Georgia", size: 15) ?? UIFont.systemFont(ofSize: 15)
        label.attributedText = NSAttributedString(
            string: "Opening Brume 24/7",
            attributes: [
                .kern: 3.0,
                .foregroundColor: champagne,
                .font: UIFont(name: "Georgia", size: 15) ?? UIFont.systemFont(ofSize: 15)
            ]
        )
        label.translatesAutoresizingMaskIntoConstraints = false

        let stack = UIStackView(arrangedSubviews: [spinner, label])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 22
        stack.translatesAutoresizingMaskIntoConstraints = false
        overlay.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: overlay.centerYAnchor)
        ])
    }

    private func observeWebView() {
        guard let webView = self.webView as? WKWebView else { return }
        progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] _, change in
            if let value = change.newValue, value >= 0.95 {
                self?.dismissOverlay()
            }
        }
        loadingObservation = webView.observe(\.isLoading, options: [.new]) { [weak self] web, change in
            if change.newValue == false, web.estimatedProgress > 0 {
                self?.dismissOverlay()
            }
        }
    }

    private func dismissOverlay() {
        guard !dismissed else { return }
        dismissed = true
        progressObservation = nil
        loadingObservation = nil
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            UIView.animate(withDuration: 0.35, animations: {
                self.overlay.alpha = 0
            }, completion: { _ in
                self.overlay.removeFromSuperview()
            })
        }
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = BrumeBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
