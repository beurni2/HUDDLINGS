// The companion on screen. Internal builds (LAB) add the Diagnostics sheet; its
// labels are tools for the team, never product copy, so they are verbatim.
import SpriteKit
import SwiftUI

struct ContentView: View {
    @State private var stage: Result<CompanionScene, Error> = Result { try CompanionScene.load() }
    #if LAB
    @State private var showingDiagnostics = false
    #endif

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Color(red: 1, green: 0.97, blue: 0.93).ignoresSafeArea()
            switch stage {
            case .success(let scene):
                SpriteView(scene: scene, preferredFramesPerSecond: 120, options: [.ignoresSiblingOrder])
                    .ignoresSafeArea()
                    .accessibilityIdentifier("companion")
                #if LAB
                Button { showingDiagnostics = true } label: { Text(verbatim: "Diagnostics") }
                    .buttonStyle(.borderedProminent)
                    .padding()
                    .sheet(isPresented: $showingDiagnostics) { DiagnosticsView(diagnostics: scene.diagnostics) }
                #endif
            case .failure(let error):
                #if LAB
                Text(verbatim: "\(error)").padding()
                #else
                Color.clear.onAppear { assertionFailure("\(error)") }
                #endif
            }
        }
    }
}
