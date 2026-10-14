// The Lab's Diagnostics (section 5b; PLAN, phase 1): frame-time and rig-time
// histograms and Metal memory, exported as JSON. It compiles only into internal
// builds (LAB, QUESTIONS.md E1); elsewhere recording does nothing.
import Foundation
import Metal
import SwiftUI

#if LAB
@MainActor
@Observable
final class Diagnostics {
    /// Frame intervals in 1 ms bins up to 50 ms, and rig times in 0.1 ms bins up to 10 ms; the last bin holds the rest.
    private(set) var frameTimes = [Int](repeating: 0, count: 51)
    private(set) var rigTimes = [Int](repeating: 0, count: 101)
    private(set) var frames = 0
    private(set) var metalBytes = 0
    var atlasSet = ""
    /// The atlas pages' size in GPU memory, computed from their dimensions (RGBA, no mipmaps).
    var atlasBytes = 0
    @ObservationIgnored private var pendingFrames = [Int](repeating: 0, count: 51)
    @ObservationIgnored private var pendingRig = [Int](repeating: 0, count: 101)
    @ObservationIgnored private var pendingCount = 0
    @ObservationIgnored private let device = MTLCreateSystemDefaultDevice()

    func record(frameInterval: Double?, rigTime: Double) {
        if let frameInterval { pendingFrames[min(Int(frameInterval * 1000), 50)] += 1 }
        pendingRig[min(Int(rigTime * 10_000), 100)] += 1
        pendingCount += 1
        // Publish twice a second, so watching the numbers does not cost frames.
        if pendingCount >= 60 {
            for i in frameTimes.indices { frameTimes[i] += pendingFrames[i]; pendingFrames[i] = 0 }
            for i in rigTimes.indices { rigTimes[i] += pendingRig[i]; pendingRig[i] = 0 }
            frames += pendingCount
            pendingCount = 0
            metalBytes = device?.currentAllocatedSize ?? 0
        }
    }

    func percentile(_ histogram: [Int], _ p: Double, binMs: Double) -> Double {
        let total = histogram.reduce(0, +)
        guard total > 0 else { return 0 }
        var seen = 0
        for (i, count) in histogram.enumerated() {
            seen += count
            if Double(seen) >= p * Double(total) { return Double(i + 1) * binMs }
        }
        return Double(histogram.count) * binMs
    }

    func json() -> String {
        var info = utsname()
        uname(&info)
        let model = withUnsafeBytes(of: &info.machine) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
        let report: [String: Any] = [
            "device": model,
            "system": ProcessInfo.processInfo.operatingSystemVersionString,
            "atlasSet": atlasSet,
            "frames": frames,
            "frameTimeMsBins": frameTimes,
            "rigTimeTenthMsBins": rigTimes,
            "frameTimeP95Ms": percentile(frameTimes, 0.95, binMs: 1),
            "rigTimeP95Ms": percentile(rigTimes, 0.95, binMs: 0.1),
            "atlasTextureBytes": atlasBytes,
            "metalAllocatedBytes": metalBytes,
        ]
        let data = (try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])) ?? Data()
        return String(decoding: data, as: UTF8.self)
    }
}

struct DiagnosticsView: View {
    let diagnostics: Diagnostics

    var body: some View {
        NavigationStack {
            List {
                Section { Text(verbatim: "Frames: \(diagnostics.frames), atlas set \(diagnostics.atlasSet)") }
                Section {
                    Histogram(bins: diagnostics.frameTimes)
                    Text(verbatim: String(format: "Frame time p95: %.0f ms", diagnostics.percentile(diagnostics.frameTimes, 0.95, binMs: 1)))
                }
                Section {
                    Histogram(bins: diagnostics.rigTimes)
                    Text(verbatim: String(format: "Rig time p95: %.1f ms", diagnostics.percentile(diagnostics.rigTimes, 0.95, binMs: 0.1)))
                }
                Section {
                    Text(verbatim: String(format: "Atlas textures: %.1f MB", Double(diagnostics.atlasBytes) / 1_048_576))
                    Text(verbatim: String(format: "All of the app's Metal memory: %.1f MB", Double(diagnostics.metalBytes) / 1_048_576))
                }
                Section { ShareLink(item: diagnostics.json()) { Text(verbatim: "Export JSON") } }
            }
            .navigationTitle(Text(verbatim: "Diagnostics"))
        }
    }
}

private struct Histogram: View {
    let bins: [Int]

    var body: some View {
        Canvas { context, size in
            let top = Double(max(bins.max() ?? 1, 1))
            let width = size.width / CGFloat(bins.count)
            for (i, count) in bins.enumerated() where count > 0 {
                let height = size.height * CGFloat(Double(count) / top)
                context.fill(Path(CGRect(x: CGFloat(i) * width, y: size.height - height, width: max(width - 1, 1), height: height)), with: .color(.accentColor))
            }
        }
        .frame(height: 80)
    }
}
#else
@MainActor
final class Diagnostics {
    var atlasSet = ""
    var atlasBytes = 0
    func record(frameInterval: Double?, rigTime: Double) {}
}
#endif
