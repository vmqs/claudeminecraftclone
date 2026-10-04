pluginManagement {
    repositories {
        mavenCentral()
        gradlePluginPortal()
        maven("https://maven.architectury.dev/")
        maven("https://maven.fabricmc.net")
        maven("https://maven.minecraftforge.net/")
        maven("https://repo.essential.gg/repository/maven-releases/")
    }
    resolutionStrategy {
        eachPlugin {
            when (requested.id.id) {
                // Essential's build of architectury-loom: the one that still supports legacy Forge 1.8.9.
                "gg.essential.loom" -> useModule("gg.essential:architectury-loom:${requested.version}")
            }
        }
    }
}

plugins {
    // Downloads the Java 8 toolchain when none is installed (Gradle itself runs on Java 17+).
    id("org.gradle.toolchains.foojay-resolver-convention") version ("0.6.0")
}

rootProject.name = "polymodels"
