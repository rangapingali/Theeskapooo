param(
  [string]$SdkRoot = "$PSScriptRoot\..\tmp\android-tools",
  [string]$JavaRoot = 'C:\Program Files\Java\jdk-26.0.2'
)
$ErrorActionPreference='Stop'
$project=(Resolve-Path $PSScriptRoot).Path
$sdk=(Resolve-Path $SdkRoot).Path
$platform=Join-Path $sdk 'platform\android-35\android.jar'
$tools=Get-ChildItem -LiteralPath (Join-Path $sdk 'tools') -Directory | Select-Object -First 1
if(!$tools -or !(Test-Path -LiteralPath $platform)){throw 'Install the verified Android platform/build tools first.'}
$toolRoot=$tools.FullName
$out=Join-Path $project 'build'
$private=Join-Path $project 'private'
New-Item -ItemType Directory -Force -Path $out,(Join-Path $out 'classes'),(Join-Path $out 'dex'),$private | Out-Null
$java=Join-Path $JavaRoot 'bin\java.exe'
$javac=Join-Path $JavaRoot 'bin\javac.exe'
$sources=@(Get-ChildItem -LiteralPath (Join-Path $project 'src') -Recurse -Filter '*.java' | ForEach-Object FullName)
& $javac --release 8 -Xlint:-options -encoding UTF-8 -cp $platform -d (Join-Path $out 'classes') @sources
if($LASTEXITCODE -ne 0){throw 'Java compilation failed'}
$classes=@(Get-ChildItem -LiteralPath (Join-Path $out 'classes') -Recurse -Filter '*.class' | ForEach-Object FullName)
& $java -cp (Join-Path $toolRoot 'lib\d8.jar') com.android.tools.r8.D8 --lib $platform --min-api 26 --output (Join-Path $out 'dex') @classes
if($LASTEXITCODE -ne 0){throw 'DEX compilation failed'}
$unsigned=Join-Path $out 'unsigned.apk'
& (Join-Path $toolRoot 'aapt2.exe') link -I $platform --manifest (Join-Path $project 'AndroidManifest.xml') --min-sdk-version 26 --target-sdk-version 35 -o $unsigned
if($LASTEXITCODE -ne 0){throw 'APK resource linking failed'}
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[System.IO.Compression.ZipFile]::Open($unsigned,[System.IO.Compression.ZipArchiveMode]::Update)
try{[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $out 'dex\classes.dex'),'classes.dex') | Out-Null}finally{$zip.Dispose()}
$aligned=Join-Path $out 'aligned.apk'
& (Join-Path $toolRoot 'zipalign.exe') -f -p 4 $unsigned $aligned
if($LASTEXITCODE -ne 0){throw 'APK alignment failed'}
$key=Join-Path $private 'helper-signing.jks'
$pass=Join-Path $private 'signing-password.txt'
if(!(Test-Path -LiteralPath $key)){
  if(Test-Path -LiteralPath $pass){throw 'Signing password exists without its key; review local signing setup.'}
  $signingPassword=[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')
  [System.IO.File]::WriteAllText($pass,$signingPassword)
  & (Join-Path $JavaRoot 'bin\keytool.exe') -genkeypair -keystore $key -storepass:file $pass -keypass:file $pass -alias helper -keyalg RSA -keysize 3072 -validity 3650 -dname 'CN=Tech Titans Local Printer Test'
  if($LASTEXITCODE -ne 0){throw 'Local signing key creation failed'}
}
$apk=Join-Path $out 'THEESKAPOOO-Print-test.apk'
& $java --enable-native-access=ALL-UNNAMED -jar (Join-Path $toolRoot 'lib\apksigner.jar') sign --ks $key --ks-key-alias helper --ks-pass "file:$pass" --out $apk $aligned
if($LASTEXITCODE -ne 0){throw 'APK signing failed'}
& $java --enable-native-access=ALL-UNNAMED -jar (Join-Path $toolRoot 'lib\apksigner.jar') verify --verbose $apk
if($LASTEXITCODE -ne 0){throw 'APK verification failed'}
Get-FileHash -LiteralPath $apk -Algorithm SHA256 | Select-Object Algorithm,Hash,Path
