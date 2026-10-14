// swift-tools-version: 6.0
// The SpriteKit runtime. CompanionCore is the pure part, the twin of
// runtime-web/src, with no Apple-only framework, so its tests run on Linux too
// (spec section 18). CompanionSpriteKit draws CompanionCore's draw lists with
// SpriteKit; on Linux it builds empty.
import PackageDescription

let package = Package(
    name: "CompanionCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "CompanionCore", targets: ["CompanionCore"]),
        .library(name: "CompanionSpriteKit", targets: ["CompanionSpriteKit"]),
    ],
    targets: [
        .target(name: "CompanionCore"),
        .target(name: "CompanionSpriteKit", dependencies: ["CompanionCore"]),
        .testTarget(name: "CompanionCoreTests", dependencies: ["CompanionCore"]),
        .testTarget(name: "CompanionSpriteKitTests", dependencies: ["CompanionCore", "CompanionSpriteKit"]),
    ]
)
