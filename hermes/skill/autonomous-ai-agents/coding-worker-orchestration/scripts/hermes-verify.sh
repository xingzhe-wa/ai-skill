#!/usr/bin/env bash
# Hermes ad-hoc Java verification harness for coding-worker changes.
#
# Purpose:
#   - Compile a focused set of production + test files against an existing
#     target/classes + project-jars + local Maven dependency layout.
#   - Run focused JUnit tests via org.junit.runner.JUnitCore.
#   - Run `git diff --check`.
#   - Self-clean: remove the script and the temporary classes directory
#     on exit, even on failure.
#
# Why this exists:
#   Some Windows hosts have a broken Maven launcher (e.g. missing
#   `org.codehaus.plexus.classworlds.launcher.Launcher`) that prevents
#   `mvn test` from running. The right move is to record the toolchain
#   issue and use a narrower verification path; never claim "Maven is
#   broken" or "tests cannot run". This script gives Hermes a
#   reproducible way to verify a focused diff without a full Maven run.
#
# Use:
#   1. Copy this file to a temp path under the OS temp directory,
#      e.g. `C:\Users\<user>\AppData\Local\Temp\hermes-verify-XXXXXX.sh`.
#      (Generate via `python -c "import tempfile; f=tempfile.NamedTemporaryFile(
#      prefix='hermes-verify-', suffix='.sh', dir=r'C:\Users\<user>\AppData\Local\Temp',
#      delete=False); print(f.name); f.close()"`)
#   2. Edit the `SOURCES`, `TESTS`, and `JUNIT_CLASSES` arrays to match
#      the changed files.
#   3. Run `bash <script_path>` from the project root. It will compile,
#      run JUnit, run `git diff --check`, then self-delete.

set -euo pipefail
repo='/d/WorkFile/PAI_ER/code/crew-client-3.0'
out_msys="$(mktemp -d '/c/Users/13400/AppData/Local/Temp/hermes-verify-classes-XXXXXX')"
out_win="$(cygpath -w "$out_msys")"
script_path="$0"
trap 'rm -rf "$out_msys"; rm -f "$script_path"' EXIT

cd "$repo"

# --- Paths to the production source files just changed. ---
SOURCES=(
  'CrewOptimizerGUIGantt/src/main/java/gui/dialog/controller/PairingDutyNodeDialog.java'
)

# --- Paths to the focused test files covering the change. ---
TESTS=(
  'CrewOptimizerGUIGantt/src/test/java/gui/dialog/controller/PairingDutyNodeDialogTest.java'
)

# --- Fully-qualified JUnit class names to run. ---
JUNIT_CLASSES=(
  'gui.dialog.controller.PairingDutyNodeDialogTest'
)

# --- Base classpath: prebuilt classes + bundled jars + the narrow set of
# Maven dependencies this minimal harness actually needs. Adjust when the
# project stack changes. ---
base_cp=(
  'CrewOptimizerGUIGantt/target/classes'
  'CrewOptimizerGUI/target/classes'
  'CrewOptimizerClient/target/classes'
  '.ALL_NEED_LIB/crew-gantt-3.0.jar'
  '.ALL_NEED_LIB/crew-gui-3.0.jar'
  '.ALL_NEED_LIB/crew-client-3.0.jar'
  "$HOME/.m2/repository/com/jfoenix/jfoenix/8.0.8/jfoenix-8.0.8.jar"
  "$HOME/.m2/repository/org/controlsfx/controlsfx/8.40.11/controlsfx-8.40.11.jar"
  "$HOME/.m2/repository/org/slf4j/slf4j-api/1.7.30/slf4j-api-1.7.30.jar"
  "$HOME/.m2/repository/org/springframework/spring-core/5.3.23/spring-core-5.3.23.jar"
  "$HOME/.m2/repository/org/springframework/spring-beans/5.3.23/spring-beans-5.3.23.jar"
  "$HOME/.m2/repository/org/springframework/spring-context/5.3.23/spring-context-5.3.23.jar"
  "$HOME/.m2/repository/org/springframework/spring-websocket/5.3.33/spring-websocket-5.3.33.jar"
  "$HOME/.m2/repository/commons-lang/commons-lang/2.4/commons-lang-2.4.jar"
  "$HOME/.m2/repository/org/apache/commons/commons-lang3/3.12.0/commons-lang3-3.12.0.jar"
  "$HOME/.m2/repository/commons-collections/commons-collections/3.2.1/commons-collections-3.2.1.jar"
  "$HOME/.m2/repository/commons-io/commons-io/2.5/commons-io-2.5.jar"
  "$HOME/.m2/repository/junit/junit/4.13.2/junit-4.13.2.jar"
  "$HOME/.m2/repository/org/hamcrest/hamcrest-core/1.3/hamcrest-core-1.3.jar"
)

cp_win=''
for p in "${base_cp[@]}"; do
  w="$(cygpath -w "$p")"
  if [[ -z "$cp_win" ]]; then cp_win="$w"; else cp_win="$cp_win;$w"; fi
done

# --- Compile all sources + tests. ---
javac -encoding UTF-8 -cp "$cp_win" -d "$out_win" "${SOURCES[@]}" "${TESTS[@]}"

# --- Run the focused JUnit tests. ---
java -cp "$out_win;$cp_win" org.junit.runner.JUnitCore "${JUNIT_CLASSES[@]}"

# --- Sanity-check whitespace/encoding on the diff. ---
git diff --check