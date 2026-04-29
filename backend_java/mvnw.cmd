<# : batch portion
@REM ----------------------------------------------------------------------------
@REM Licensed to the Apache Software Foundation (ASF) under one
@REM or more contributor license agreements.  See the NOTICE file
@REM distributed with this work for additional information
@REM regarding copyright ownership.  The ASF licenses this file
@REM to you under the Apache License, Version 2.0 (the
@REM "License"); you may not use this file except in compliance
@REM with the License.  You may obtain a copy of the License at
@REM
@REM    http://www.apache.org/licenses/LICENSE-2.0
@REM
@REM Unless required by applicable law or agreed to in writing,
@REM software distributed under the License is distributed on an
@REM "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
@REM KIND, either express or implied.  See the License for the
@REM specific language governing permissions and limitations
@REM under the License.
@REM ----------------------------------------------------------------------------

@REM ----------------------------------------------------------------------------
@REM Apache Maven Wrapper startup batch script, version 3.3.2
@REM
@REM Optional ENV vars
@REM -----------------
@REM   JAVA_HOME - location of a JDK home dir, the wrapper will use it if set
@REM   MAVEN_OPTS - parameters passed to the Java VM when running Maven
@REM                e.g. to debug Maven itself, use
@REM                set MAVEN_OPTS=-Xdebug -Xrunjdwp:transport=dt_socket,server=y,suspend=y,address=8000
@REM   MVNW_REPOURL - repo url base for downloading maven distribution
@REM   MVNW_USERNAME/MVNW_PASSWORD - user and password for downloading maven
@REM   MVNW_VERBOSE - true: enable verbose log; others: silence the output
@REM ----------------------------------------------------------------------------

@IF "%__MVNW_ARG0_NAME__%"=="" (SET __MVNW_ARG0_NAME__=%~nx0)
@SET __MVNW_CMD__=
@SET __MVNW_ERROR__=
@SET __MVNW_PSMODULEP_SAVE=%PSModulePath%
@SET PSModulePath=
@FOR /F "usebackq tokens=1* delims==" %%A IN (`powershell -noprofile "& {$scriptDir='%~dp0'; $script='%__MVNW_ARG0_NAME__%'; icm -ScriptBlock ([Scriptblock]::Create((Get-Content -Raw '%~f0'))) -NoNewScope}"`) DO @(
  IF "%%A"=="MVNW_COMMAND" (SET __MVNW_CMD__=%%B) ELSE IF "%%A"=="MVNW_ERROR" (SET __MVNW_ERROR__=%%B)
)
@SET PSModulePath=%__MVNW_PSMODULEP_SAVE%
@SET __MVNW_PSMODULEP_SAVE=
@SET __MVNW_ARG0_NAME__=
@IF NOT "%__MVNW_ERROR__%"=="" (
  ECHO [ERROR] %__MVNW_ERROR__%
  EXIT /B 1
)

@"%__MVNW_CMD__%" %*
@ECHO OFF
SET __MVNW_CMD__=
EXIT /B %ERRORLEVEL%

: end batch / begin powershell #>

$ErrorActionPreference = "Stop"
if ($env:MVNW_VERBOSE -eq "true") {
  $VerbosePreference = "Continue"
}

# Determine the Java command to use to start the JVM.
if ($env:JAVA_HOME) {
  $javaCmd = Join-Path $env:JAVA_HOME "bin\java.exe"
} else {
  $javaCmd = "java.exe"
}

$wrapperJar = Join-Path $scriptDir ".mvn\wrapper\maven-wrapper.jar"
$wrapperProperties = Join-Path $scriptDir ".mvn\wrapper\maven-wrapper.properties"

# Download the wrapper jar if it doesn't exist
if (!(Test-Path $wrapperJar)) {
  if (!(Test-Path (Split-Path $wrapperJar))) {
    New-Item -ItemType Directory -Path (Split-Path $wrapperJar) -Force | Out-Null
  }
  Write-Verbose "Couldn't find $wrapperJar, downloading it ..."
  
  if ($env:MVNW_REPOURL) {
    $jarSourceUrl = "$($env:MVNW_REPOURL)/org/apache/maven/wrapper/maven-wrapper/3.3.2/maven-wrapper-3.3.2.jar"
  } else {
    $jarSourceUrl = "https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.3.2/maven-wrapper-3.3.2.jar"
  }

  $webClient = New-Object System.Net.WebClient
  if ($env:MVNW_USERNAME -and $env:MVNW_PASSWORD) {
    $webClient.Credentials = New-Object System.Net.NetworkCredential($env:MVNW_USERNAME, $env:MVNW_PASSWORD)
  }
  $webClient.DownloadFile($jarSourceUrl, $wrapperJar)
}

$mavenOpts = ""
if ($env:MAVEN_OPTS) {
  $mavenOpts = $env:MAVEN_OPTS
}

$command = "& `"$javaCmd`" $mavenOpts -classpath `"$wrapperJar`" `"-Dmaven.multiModuleProjectDirectory=$scriptDir`" org.apache.maven.wrapper.MavenWrapperMain"
Write-Output "MVNW_COMMAND=$command"
