# RITM: проверенная Android-сборка в Windows

Рабочая среда проекта: Node 24, JDK 21, Android SDK 36 / build-tools 35 и Gradle wrapper 8.11.1. Health Connect 1.1.0 требует compileSdk 36; для него используются AGP 8.10.1 и Kotlin 2.1.21, targetSdk 35 сохранён. Инструменты подготовлены в `work/toolchain/`, Gradle cache в `work/gradle-cache/`. Исходники находятся в `work/openGym-upstream/`.

Сначала из `frontend/` выполните мобильную Vite-сборку с `VITE_MOBILE=1`, исходными закреплёнными `VITE_IMG_BASE` и `VITE_GIF_BASE` из `package.json`, затем `node node_modules/@capacitor/cli/bin/capacitor sync android`. `dist/` должен содержать именно мобильную сборку перед упаковкой APK.

В `frontend/android/` выставите процессные `JAVA_HOME`, `ANDROID_SDK_ROOT`, `GRADLE_USER_HOME` на подготовленные инструменты. Для Android user files можно указать `ANDROID_USER_HOME` внутри task-local toolchain.

В этой среде Windows две особенности JDK потребовали процессных параметров:

```powershell
# Полный короткий ASCII-путь к каталогу work; команда только читает путь.
$taskAsciiWork = (& cmd.exe /d /c 'for %I in ("..\..\..") do @echo %~fsI').Trim().Replace('\', '/')
if ($taskAsciiWork -match '[^\x00-\x7f]') { throw 'Нужен доступный для записи ASCII-путь для Java Unix-domain socket' }
$env:JAVA_TOOL_OPTIONS = "-Dfile.encoding=COMPAT -Djdk.net.unixdomain.tmpdir=$taskAsciiWork"
& ./gradlew.bat :app:assembleDebug :app:testDebugUnitTest --no-daemon
```

Без `jdk.net.unixdomain.tmpdir` Windows pipe при `Selector.open()` завершался `Invalid argument: connect`. Без `file.encoding=COMPAT` Java не находила `GradleWorkerMain` из аргументного файла с кириллическим путём. Параметры действуют только на текущие процессы; системные настройки безопасности не менялись. Исходники Java явно компилируются в UTF-8. Для кириллицы в пути репозитория сохранено `android.overridePathCheck=true`.

В ограниченной песочнице Capacitor CLI не мог выполнить `os.userInfo()` (`uv_os_get_passwd`, ENOMEM); та же команда вне ограничения прошла без изменения зависимостей.

На 2026-10-03 проверены веб- и мобильная Vite-сборки, Capacitor sync, Android debug APK и 12 JUnit-тестов (3237 тестов frontend). Debug package — `local.opengym.personal.test`, имя `RITM Test`. Это проверка разработки; личный релиз с отдельным сохранённым ключом подписи и проверка Health Connect/обмена на телефоне остаются следующими этапами проекта.
