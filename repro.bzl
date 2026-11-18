"""One copy of the app per lockfile variant, so both run through the same rules_js layout."""

load("@aspect_bazel_lib//lib:copy_file.bzl", "copy_file")
load("@aspect_rules_js//js:defs.bzl", "js_run_binary", "js_test")

def repro_variant(npm_link_all_packages, vite_bin, expect_broken = False):
    npm_link_all_packages(name = "node_modules")

    srcs = []
    for f in ["vite.config.mjs", "src/main.mjs", "check.mjs"]:
        copy_file(name = "copy_" + f.replace("/", "_"), src = "//app:" + f, out = f)
        srcs.append(f)

    vite_bin.vite_binary(name = "vite")

    # Same shape as agi's :main_vite_sdk: vite build in the sandbox, plugin copier writes dist/node_modules.
    js_run_binary(
        name = "main_vite",
        srcs = ["vite.config.mjs", "src/main.mjs", ":node_modules"],
        args = ["build"],
        chdir = native.package_name(),
        out_dirs = ["dist"],
        log_level = "info",
        silent_on_success = False,
        tool = ":vite",
    )

    js_test(
        name = "runtime_test",
        data = [":main_vite"],
        entry_point = "check.mjs",
        args = ["$(rootpath :main_vite)"] + (["--expect-broken"] if expect_broken else []),
    )
