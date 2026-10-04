import org.apache.commons.lang3.SystemUtils

// Poly Player Models: a client-side Forge 1.8.9 mod. Build: ./gradlew build -> build/libs/polymodels-1.0.0.jar
// Toolchain from the nea89o/Forge1.8.9Template (architectury-loom, legacy Forge 1.8.9-11.15.1.2318),
// without mixins, the shadow plugin or DevAuth (not needed here).

plugins {
    idea
    java
    id("gg.essential.loom") version "0.10.0.+"
    id("dev.architectury.architectury-pack200") version "0.1.3"
}

val baseGroup: String by project
val mcVersion: String by project
val version: String by project
val modid: String by project

group = baseGroup

java {
    // Legacy Forge needs Java 8 bytecode and a Java 8 runtime.
    toolchain.languageVersion.set(JavaLanguageVersion.of(8))
}

loom {
    log4jConfigs.from(file("log4j2.xml"))
    runConfigs {
        "client" {
            if (SystemUtils.IS_OS_MAC_OSX) {
                // This argument crashes the game on macOS.
                vmArgs.remove("-XstartOnFirstThread")
            }
            // Extra JVM arguments for a run, e.g. -PrunJvmArgs="-Dpolymodels.devtest=/tmp/out"
            (project.findProperty("runJvmArgs") as String?)?.split(' ')?.filter { it.isNotBlank() }?.let { vmArgs.addAll(it) }
        }
        remove(getByName("server"))
    }
    forge {
        pack200Provider.set(dev.architectury.pack200.java.Pack200Adapter())
    }
}

// FML finds a mod's assets next to its classes in the development environment.
sourceSets.main {
    output.setResourcesDir(sourceSets.main.flatMap { it.java.classesDirectory })
}

repositories {
    mavenCentral()
}

dependencies {
    minecraft("com.mojang:minecraft:1.8.9")
    mappings("de.oceanlabs.mcp:mcp_stable:22-1.8.9")
    forge("net.minecraftforge:forge:1.8.9-11.15.1.2318-1.8.9")
}

// The built-in models are the web game's own files (public/models/<id>/model.mcpm), copied into
// the jar at build time so the repository holds them only once. -PmodelsDir=<dir> overrides the
// source when the mod is built outside the repository.
val modelsDir = file(project.findProperty("modelsDir") as String? ?: "../../public/models")
val generatedResources = layout.buildDirectory.dir("generated/builtinModels")
val copyBuiltinModels by tasks.registering(Sync::class) {
    description = "Copies the web game's built-in .mcpm models into the mod's resources."
    from(modelsDir) {
        include("*/model.mcpm")
        eachFile { path = "assets/$modid/models/${file.parentFile.name}.mcpm" }
        includeEmptyDirs = false
    }
    from(modelsDir) {
        include("index.json")
        into("assets/$modid/models")
    }
    into(generatedResources)
    doLast {
        val n = fileTree(generatedResources).matching { include("**/*.mcpm") }.files.size
        if (n == 0) throw GradleException("No built-in models found in $modelsDir (pass -PmodelsDir=<dir with <id>/model.mcpm>)")
        println("Bundled $n built-in models from $modelsDir")
    }
}
sourceSets.main { resources.srcDir(copyBuiltinModels) }

tasks.withType(JavaCompile::class) {
    options.encoding = "UTF-8"
}

tasks.withType(org.gradle.jvm.tasks.Jar::class) {
    archiveBaseName.set(modid)
}

tasks.processResources {
    inputs.property("version", project.version)
    inputs.property("mcversion", mcVersion)
    inputs.property("modid", modid)
    filesMatching("mcmod.info") {
        expand(inputs.properties)
    }
}

tasks.jar {
    archiveClassifier.set("without-deps")
    destinationDirectory.set(layout.buildDirectory.dir("intermediates"))
}

tasks.named<net.fabricmc.loom.task.RemapJarTask>("remapJar") {
    archiveClassifier.set("")
}

tasks.assemble.get().dependsOn(tasks.remapJar)

// loom 0.10's runClient fails Gradle 8's task validation (it overrides JavaExec.getMain, which
// Gradle 8 removed). This plain JavaExec runs the same launch configuration on the Java 8 toolchain.
val runClientDirect by tasks.registering(JavaExec::class) {
    group = "loom"
    description = "Runs the Minecraft client with the mod (same launch as loom's runClient)."
    dependsOn(tasks.classes, tasks.named("downloadAssets"))
    val config = net.fabricmc.loom.configuration.ide.RunConfig.runConfig(project, loom.runConfigs.getByName("client"))
    classpath = config.sourceSet.runtimeClasspath
    mainClass.set(config.mainClass)
    jvmArgs(config.vmArgs)
    args(config.programArgs)
    environment(config.envVariables)
    val dir = rootProject.file(config.runDir)
    workingDir = dir
    doFirst { dir.mkdirs() }
    javaLauncher.set(javaToolchains.launcherFor(java.toolchain))
}
