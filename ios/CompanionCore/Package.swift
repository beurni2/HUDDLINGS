// swift-tools-version: 6.0
// The pure part of the SpriteKit runtime: the twin of runtime-web/src, with no
// Apple-only framework, so its tests run on Linux too (spec section 18).
import PackageDescription

let package = Package(
    name: "CompanionCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "CompanionCore", targets: ["CompanionCore"])],
    targets: [
        .target(name: "CompanionCore"),
        .testTarget(name: "CompanionCoreTests", dependencies: ["CompanionCore"]),
    ]
)
