Set-StrictMode -Version 2.0

if ($null -eq ('Afex.DisposableLoginCredential' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Security;

namespace Afex
{
    public sealed class DisposableLoginCredential : IDisposable
    {
        private readonly object syncRoot = new object();
        private SecureString passwordSecureString;
        private string scramVerifier;
        private bool disposed;

        public int IterationCount { get; private set; }
        public int SaltLengthBytes { get; private set; }
        public int StoredKeyLengthBytes { get; private set; }
        public int ServerKeyLengthBytes { get; private set; }
        public int PasswordEntropyBits { get; private set; }
        public int PasswordCharacterLength { get; private set; }
        public string ContractVersion { get; private set; }
        public DateTime GeneratedUtc { get; private set; }
        public bool IsDisposed
        {
            get
            {
                lock (syncRoot) { return disposed; }
            }
        }

        public DisposableLoginCredential(
            SecureString passwordSecureString,
            string scramVerifier,
            DateTime generatedUtc,
            string contractVersion)
        {
            if (passwordSecureString == null || scramVerifier == null)
            {
                throw new InvalidOperationException("UNKNOWN_CRYPTOGRAPHIC_FAILURE");
            }

            this.passwordSecureString = passwordSecureString;
            this.scramVerifier = scramVerifier;
            GeneratedUtc = generatedUtc;
            ContractVersion = contractVersion;
            IterationCount = 4096;
            SaltLengthBytes = 16;
            StoredKeyLengthBytes = 32;
            ServerKeyLengthBytes = 32;
            PasswordEntropyBits = 256;
            PasswordCharacterLength = 43;
        }

        public SecureString GetPasswordSecureString()
        {
            lock (syncRoot)
            {
                ThrowIfDisposed();
                return passwordSecureString.Copy();
            }
        }

        public string GetScramVerifier()
        {
            lock (syncRoot)
            {
                ThrowIfDisposed();
                return scramVerifier;
            }
        }

        public void Dispose()
        {
            lock (syncRoot)
            {
                if (disposed) { return; }
                if (passwordSecureString != null)
                {
                    passwordSecureString.Dispose();
                    passwordSecureString = null;
                }
                scramVerifier = null;
                disposed = true;
            }
        }

        private void ThrowIfDisposed()
        {
            if (disposed)
            {
                throw new ObjectDisposedException(
                    "Afex.DisposableLoginCredential",
                    "SECRET_CONTAINER_DISPOSED");
            }
        }

        public override string ToString()
        {
            return "[Afex.DisposableLoginCredential: secrets redacted]";
        }
    }
}
'@ -Language CSharp -ErrorAction Stop
}

$script:AfexScramContractVersion = 'A2.4E-SCRAM-v1'
$script:AfexScramIterationCount = 4096
$script:AfexScramVerifierPattern = '^SCRAM-SHA-256\$4096:([A-Za-z0-9+/]{22}==)\$([A-Za-z0-9+/]{43}=):([A-Za-z0-9+/]{43}=)$'
$script:AfexScramStableErrors = @(
    'UNSUPPORTED_POWERSHELL_RUNTIME',
    'PASSWORD_GENERATION_FAILED',
    'PASSWORD_POLICY_FAILED',
    'SALT_GENERATION_FAILED',
    'PBKDF2_FAILED',
    'SCRAM_FORMAT_FAILED',
    'SCRAM_VALIDATION_FAILED',
    'SECRET_ZEROIZATION_FAILED',
    'ENCODING_MISMATCH',
    'UNKNOWN_CRYPTOGRAPHIC_FAILURE',
    'FIXED_VECTOR_MISMATCH',
    'SWAPPED_KEY_REJECTION_FAILED',
    'SECRET_CONTAINER_DISPOSED'
)

function New-AfexStableException {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet(
            'UNSUPPORTED_POWERSHELL_RUNTIME',
            'PASSWORD_GENERATION_FAILED',
            'PASSWORD_POLICY_FAILED',
            'SALT_GENERATION_FAILED',
            'PBKDF2_FAILED',
            'SCRAM_FORMAT_FAILED',
            'SCRAM_VALIDATION_FAILED',
            'SECRET_ZEROIZATION_FAILED',
            'ENCODING_MISMATCH',
            'UNKNOWN_CRYPTOGRAPHIC_FAILURE',
            'FIXED_VECTOR_MISMATCH',
            'SWAPPED_KEY_REJECTION_FAILED',
            'SECRET_CONTAINER_DISPOSED'
        )]
        [string]$Code
    )

    return New-Object System.InvalidOperationException($Code)
}

function Clear-AfexByteArray {
    param([byte[]]$Bytes)

    if ($null -ne $Bytes) {
        [System.Array]::Clear($Bytes, 0, $Bytes.Length)
    }
}

function Test-AfexCanonicalBase64 {
    param(
        [Parameter(Mandatory = $true)][string]$Value,
        [Parameter(Mandatory = $true)][int]$ExpectedLength
    )

    [byte[]]$decoded = $null
    try {
        $decoded = [System.Convert]::FromBase64String($Value)
        return (
            $decoded.Length -eq $ExpectedLength -and
            [System.Convert]::ToBase64String($decoded) -ceq $Value
        )
    }
    catch {
        return $false
    }
    finally {
        Clear-AfexByteArray -Bytes $decoded
    }
}

function Invoke-AfexScramDerivation {
    param(
        [Parameter(Mandatory = $true)][string]$Password,
        [Parameter(Mandatory = $true)][byte[]]$SaltBytes
    )

    [byte[]]$passwordBytes = $null
    [byte[]]$saltCopy = $null
    [byte[]]$saltedPassword = $null
    [byte[]]$clientLabel = $null
    [byte[]]$serverLabel = $null
    [byte[]]$clientKey = $null
    [byte[]]$storedKey = $null
    [byte[]]$serverKey = $null
    $pbkdf2 = $null
    $clientHmac = $null
    $serverHmac = $null
    $sha256 = $null
    [object[]]$constructorArguments = $null
    $derivationCompleted = $false

    try {
        $constructor = [System.Security.Cryptography.Rfc2898DeriveBytes].GetConstructor(@(
            [byte[]],
            [byte[]],
            [int],
            [System.Security.Cryptography.HashAlgorithmName]
        ))
        if ($null -eq $constructor) {
            throw (New-AfexStableException -Code 'UNSUPPORTED_POWERSHELL_RUNTIME')
        }

        $passwordBytes = New-Object byte[] ([System.Text.Encoding]::UTF8.GetByteCount($Password))
        $encodedCount = [System.Text.Encoding]::UTF8.GetBytes($Password, 0, $Password.Length, $passwordBytes, 0)
        if ($encodedCount -ne 43 -or $passwordBytes.Length -ne 43) {
            throw (New-AfexStableException -Code 'ENCODING_MISMATCH')
        }

        $saltCopy = New-Object byte[] $SaltBytes.Length
        [System.Array]::Copy($SaltBytes, $saltCopy, $SaltBytes.Length)

        try {
            $constructorArguments = New-Object object[] 4
            $constructorArguments[0] = $passwordBytes
            $constructorArguments[1] = $saltCopy
            $constructorArguments[2] = $script:AfexScramIterationCount
            $constructorArguments[3] = [System.Security.Cryptography.HashAlgorithmName]::SHA256
            $pbkdf2 = $constructor.Invoke($constructorArguments)
            $saltedPassword = $pbkdf2.GetBytes(32)
        }
        catch {
            if ($_.Exception.Message -in $script:AfexScramStableErrors) { throw }
            throw (New-AfexStableException -Code 'PBKDF2_FAILED')
        }

        if ($saltedPassword.Length -ne 32) {
            throw (New-AfexStableException -Code 'PBKDF2_FAILED')
        }

        $clientLabel = [System.Text.Encoding]::ASCII.GetBytes('Client Key')
        $serverLabel = [System.Text.Encoding]::ASCII.GetBytes('Server Key')

        $clientHmac = New-Object System.Security.Cryptography.HMACSHA256(,$saltedPassword)
        $clientKey = $clientHmac.ComputeHash($clientLabel)
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        $storedKey = $sha256.ComputeHash($clientKey)
        $serverHmac = New-Object System.Security.Cryptography.HMACSHA256(,$saltedPassword)
        $serverKey = $serverHmac.ComputeHash($serverLabel)

        if (
            $clientKey.Length -ne 32 -or
            $storedKey.Length -ne 32 -or
            $serverKey.Length -ne 32
        ) {
            throw (New-AfexStableException -Code 'SCRAM_VALIDATION_FAILED')
        }

        $result = [pscustomobject]@{
            SaltedPassword = $saltedPassword
            ClientKey = $clientKey
            StoredKey = $storedKey
            ServerKey = $serverKey
        }
        $derivationCompleted = $true
        return $result
    }
    catch {
        if ($_.Exception.Message -in $script:AfexScramStableErrors) { throw }
        throw (New-AfexStableException -Code 'UNKNOWN_CRYPTOGRAPHIC_FAILURE')
    }
    finally {
        if ($null -ne $pbkdf2) { $pbkdf2.Dispose() }
        if ($null -ne $clientHmac) { $clientHmac.Dispose() }
        if ($null -ne $serverHmac) { $serverHmac.Dispose() }
        if ($null -ne $sha256) { $sha256.Dispose() }
        Clear-AfexByteArray -Bytes $passwordBytes
        Clear-AfexByteArray -Bytes $saltCopy
        Clear-AfexByteArray -Bytes $clientLabel
        Clear-AfexByteArray -Bytes $serverLabel
        if (-not $derivationCompleted) {
            Clear-AfexByteArray -Bytes $saltedPassword
            Clear-AfexByteArray -Bytes $clientKey
            Clear-AfexByteArray -Bytes $storedKey
            Clear-AfexByteArray -Bytes $serverKey
        }
        $constructorArguments = $null
    }
}

function New-AfexSafeCredentialObject {
    param(
        [Parameter(Mandatory = $true)][System.Security.SecureString]$PasswordSecureString,
        [Parameter(Mandatory = $true)][string]$ScramVerifier,
        [Parameter(Mandatory = $true)][datetime]$GeneratedUtc
    )

    [object[]]$arguments = New-Object object[] 4
    $arguments[0] = $PasswordSecureString
    $arguments[1] = $ScramVerifier
    $arguments[2] = $GeneratedUtc
    $arguments[3] = $script:AfexScramContractVersion
    try {
        return [System.Activator]::CreateInstance(
            [Afex.DisposableLoginCredential],
            $arguments
        )
    }
    finally {
        $arguments = $null
    }
}

function New-AfexDisposableLoginCredential {
    [CmdletBinding()]
    param()

    [byte[]]$passwordRandomBytes = $null
    [byte[]]$saltBytes = $null
    [byte[]]$saltedPassword = $null
    [byte[]]$clientKey = $null
    [byte[]]$storedKey = $null
    [byte[]]$serverKey = $null
    [byte[]]$decodedSalt = $null
    [byte[]]$decodedStoredKey = $null
    [byte[]]$decodedServerKey = $null
    $rng = $null
    $password = $null
    $passwordBase64 = $null
    $saltBase64 = $null
    $storedKeyBase64 = $null
    $serverKeyBase64 = $null
    $verifier = $null
    $securePassword = $null
    $derivation = $null
    $result = $null
    $zeroizationFailed = $false

    try {
        try {
            $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
            if ($null -eq $rng) {
                throw (New-AfexStableException -Code 'UNSUPPORTED_POWERSHELL_RUNTIME')
            }
        }
        catch {
            if ($_.Exception.Message -in $script:AfexScramStableErrors) { throw }
            throw (New-AfexStableException -Code 'UNSUPPORTED_POWERSHELL_RUNTIME')
        }

        try {
            $passwordRandomBytes = New-Object byte[] 32
            $rng.GetBytes($passwordRandomBytes)
            $passwordBase64 = [System.Convert]::ToBase64String($passwordRandomBytes)
            $password = $passwordBase64.TrimEnd('=').Replace('+', '-').Replace('/', '_')
        }
        catch {
            throw (New-AfexStableException -Code 'PASSWORD_GENERATION_FAILED')
        }

        if (
            $password.Length -ne 43 -or
            $password -cnotmatch '^[A-Za-z0-9_-]{43}$' -or
            [System.Text.Encoding]::ASCII.GetByteCount($password) -ne 43
        ) {
            throw (New-AfexStableException -Code 'PASSWORD_POLICY_FAILED')
        }

        $securePassword = New-Object System.Security.SecureString
        foreach ($character in $password.ToCharArray()) {
            $securePassword.AppendChar($character)
        }
        $securePassword.MakeReadOnly()

        try {
            $saltBytes = New-Object byte[] 16
            $rng.GetBytes($saltBytes)
            $saltBase64 = [System.Convert]::ToBase64String($saltBytes)
        }
        catch {
            throw (New-AfexStableException -Code 'SALT_GENERATION_FAILED')
        }

        if (
            $saltBase64.Length -ne 24 -or
            -not (Test-AfexCanonicalBase64 -Value $saltBase64 -ExpectedLength 16)
        ) {
            throw (New-AfexStableException -Code 'SALT_GENERATION_FAILED')
        }

        $derivation = Invoke-AfexScramDerivation -Password $password -SaltBytes $saltBytes
        $saltedPassword = $derivation.SaltedPassword
        $clientKey = $derivation.ClientKey
        $storedKey = $derivation.StoredKey
        $serverKey = $derivation.ServerKey

        $storedKeyBase64 = [System.Convert]::ToBase64String($storedKey)
        $serverKeyBase64 = [System.Convert]::ToBase64String($serverKey)
        $verifier = 'SCRAM-SHA-256$4096:{0}${1}:{2}' -f $saltBase64, $storedKeyBase64, $serverKeyBase64

        if (
            $verifier.Length -ne 133 -or
            $verifier -cnotmatch $script:AfexScramVerifierPattern -or
            $verifier -match '[\x00-\x20\x7f]' -or
            $verifier.StartsWith('md5', [System.StringComparison]::OrdinalIgnoreCase)
        ) {
            throw (New-AfexStableException -Code 'SCRAM_FORMAT_FAILED')
        }

        $match = [System.Text.RegularExpressions.Regex]::Match(
            $verifier,
            $script:AfexScramVerifierPattern,
            [System.Text.RegularExpressions.RegexOptions]::CultureInvariant
        )
        if (-not $match.Success -or $match.Groups.Count -ne 4) {
            throw (New-AfexStableException -Code 'SCRAM_VALIDATION_FAILED')
        }

        try {
            $decodedSalt = [System.Convert]::FromBase64String($match.Groups[1].Value)
            $decodedStoredKey = [System.Convert]::FromBase64String($match.Groups[2].Value)
            $decodedServerKey = [System.Convert]::FromBase64String($match.Groups[3].Value)
        }
        catch {
            throw (New-AfexStableException -Code 'SCRAM_VALIDATION_FAILED')
        }

        if (
            $decodedSalt.Length -ne 16 -or
            $decodedStoredKey.Length -ne 32 -or
            $decodedServerKey.Length -ne 32 -or
            [System.Convert]::ToBase64String($decodedSalt) -cne $match.Groups[1].Value -or
            [System.Convert]::ToBase64String($decodedStoredKey) -cne $match.Groups[2].Value -or
            [System.Convert]::ToBase64String($decodedServerKey) -cne $match.Groups[3].Value
        ) {
            throw (New-AfexStableException -Code 'SCRAM_VALIDATION_FAILED')
        }

        $result = New-AfexSafeCredentialObject `
            -PasswordSecureString $securePassword `
            -ScramVerifier $verifier `
            -GeneratedUtc ([datetime]::UtcNow)
    }
    catch {
        if ($null -ne $securePassword -and $null -eq $result) {
            $securePassword.Dispose()
        }
        if ($_.Exception.Message -in $script:AfexScramStableErrors) { throw }
        throw (New-AfexStableException -Code 'UNKNOWN_CRYPTOGRAPHIC_FAILURE')
    }
    finally {
        try {
            if ($null -ne $rng) { $rng.Dispose() }
            Clear-AfexByteArray -Bytes $passwordRandomBytes
            Clear-AfexByteArray -Bytes $saltBytes
            Clear-AfexByteArray -Bytes $saltedPassword
            Clear-AfexByteArray -Bytes $clientKey
            Clear-AfexByteArray -Bytes $storedKey
            Clear-AfexByteArray -Bytes $serverKey
            Clear-AfexByteArray -Bytes $decodedSalt
            Clear-AfexByteArray -Bytes $decodedStoredKey
            Clear-AfexByteArray -Bytes $decodedServerKey
        }
        catch {
            $zeroizationFailed = $true
        }

        $password = $null
        $passwordBase64 = $null
        $saltBase64 = $null
        $storedKeyBase64 = $null
        $serverKeyBase64 = $null
        $verifier = $null
        $derivation = $null
    }

    if ($zeroizationFailed) {
        if ($null -ne $securePassword) { $securePassword.Dispose() }
        throw (New-AfexStableException -Code 'SECRET_ZEROIZATION_FAILED')
    }

    return $result
}

function ConvertFrom-AfexHex {
    param([Parameter(Mandatory = $true)][string]$Hex)

    if ($Hex.Length % 2 -ne 0 -or $Hex -cnotmatch '^[0-9a-f]+$') {
        throw (New-AfexStableException -Code 'FIXED_VECTOR_MISMATCH')
    }

    [byte[]]$bytes = New-Object byte[] ($Hex.Length / 2)
    for ($index = 0; $index -lt $bytes.Length; $index++) {
        $bytes[$index] = [System.Convert]::ToByte($Hex.Substring($index * 2, 2), 16)
    }
    return $bytes
}

function Test-AfexFixedTimeByteArrayEqual {
    param(
        [byte[]]$Left,
        [byte[]]$Right
    )

    if ($null -eq $Left -or $null -eq $Right) { return $false }
    $difference = $Left.Length -bxor $Right.Length
    $comparisonLength = [System.Math]::Min($Left.Length, $Right.Length)
    for ($index = 0; $index -lt $comparisonLength; $index++) {
        $difference = $difference -bor ($Left[$index] -bxor $Right[$index])
    }
    return $difference -eq 0
}

function Test-AfexFixedTimeAsciiEqual {
    param(
        [Parameter(Mandatory = $true)][string]$Left,
        [Parameter(Mandatory = $true)][string]$Right
    )

    [byte[]]$leftBytes = $null
    [byte[]]$rightBytes = $null
    try {
        $leftBytes = [System.Text.Encoding]::ASCII.GetBytes($Left)
        $rightBytes = [System.Text.Encoding]::ASCII.GetBytes($Right)
        return Test-AfexFixedTimeByteArrayEqual -Left $leftBytes -Right $rightBytes
    }
    finally {
        Clear-AfexByteArray -Bytes $leftBytes
        Clear-AfexByteArray -Bytes $rightBytes
    }
}

function Invoke-AfexScramSelfTest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Password,
        [Parameter(Mandatory = $true)][byte[]]$SaltBytes,
        [Parameter(Mandatory = $true)][switch]$TestOnly
    )

    [byte[]]$saltCopy = $null
    [byte[]]$saltedPassword = $null
    [byte[]]$clientKey = $null
    [byte[]]$storedKey = $null
    [byte[]]$serverKey = $null
    [byte[]]$expectedSaltedPassword = $null
    [byte[]]$expectedClientKey = $null
    [byte[]]$expectedStoredKey = $null
    [byte[]]$expectedServerKey = $null
    $derivation = $null
    $saltBase64 = $null
    $storedKeyBase64 = $null
    $serverKeyBase64 = $null
    $verifier = $null
    $swappedVerifier = $null

    $expectedPassword = 'A2_4E_FIXED_NONPRODUCTION_VECTOR_0000000000'
    $expectedSaltBase64 = 'AAECAwQFBgcICQoLDA0ODw=='
    $expectedStoredKeyBase64 = 'pEytV1p5JWVKj4Nn+ulpOfNDl1RfYNehIbL9Us0PdR8='
    $expectedServerKeyBase64 = '9Aon9x1ClAWtc7RG9WzhS+RgIwbU2DTW8uWm20G81g4='
    $expectedVerifier = 'SCRAM-SHA-256$4096:AAECAwQFBgcICQoLDA0ODw==$pEytV1p5JWVKj4Nn+ulpOfNDl1RfYNehIbL9Us0PdR8=:9Aon9x1ClAWtc7RG9WzhS+RgIwbU2DTW8uWm20G81g4='

    if (-not $TestOnly.IsPresent) {
        throw (New-AfexStableException -Code 'SCRAM_VALIDATION_FAILED')
    }
    if ($Password -cnotmatch '^[A-Za-z0-9_-]{43}$' -or $SaltBytes.Length -ne 16) {
        throw (New-AfexStableException -Code 'SCRAM_VALIDATION_FAILED')
    }

    try {
        if (
            $Password -cne $expectedPassword -or
            [System.Convert]::ToBase64String($SaltBytes) -cne $expectedSaltBase64
        ) {
            throw (New-AfexStableException -Code 'FIXED_VECTOR_MISMATCH')
        }

        $saltCopy = New-Object byte[] 16
        [System.Array]::Copy($SaltBytes, $saltCopy, 16)
        $derivation = Invoke-AfexScramDerivation -Password $Password -SaltBytes $saltCopy
        $saltedPassword = $derivation.SaltedPassword
        $clientKey = $derivation.ClientKey
        $storedKey = $derivation.StoredKey
        $serverKey = $derivation.ServerKey

        $expectedSaltedPassword = ConvertFrom-AfexHex -Hex '60343a6890182055039f50d63cc7c0214052b96d0694959b532872da9644b325'
        $expectedClientKey = ConvertFrom-AfexHex -Hex '07492086cacc39346e8072c976f9b3926559c75895ca6d2a175f018b31549745'
        $expectedStoredKey = ConvertFrom-AfexHex -Hex 'a44cad575a7925654a8f8367fae96939f34397545f60d7a121b2fd52cd0f751f'
        $expectedServerKey = ConvertFrom-AfexHex -Hex 'f40a27f71d429405ad73b446f56ce14be4602306d4d834d6f2e5a6db41bcd60e'

        $saltedPasswordMatch = Test-AfexFixedTimeByteArrayEqual -Left $saltedPassword -Right $expectedSaltedPassword
        $clientKeyMatch = Test-AfexFixedTimeByteArrayEqual -Left $clientKey -Right $expectedClientKey
        $storedKeyMatch = Test-AfexFixedTimeByteArrayEqual -Left $storedKey -Right $expectedStoredKey
        $serverKeyMatch = Test-AfexFixedTimeByteArrayEqual -Left $serverKey -Right $expectedServerKey

        $saltBase64 = [System.Convert]::ToBase64String($saltCopy)
        $storedKeyBase64 = [System.Convert]::ToBase64String($storedKey)
        $serverKeyBase64 = [System.Convert]::ToBase64String($serverKey)
        $verifier = 'SCRAM-SHA-256$4096:{0}${1}:{2}' -f $saltBase64, $storedKeyBase64, $serverKeyBase64
        $verifierMatch = Test-AfexFixedTimeAsciiEqual -Left $verifier -Right $expectedVerifier

        if (
            -not $saltedPasswordMatch -or
            -not $clientKeyMatch -or
            -not $storedKeyMatch -or
            -not $serverKeyMatch -or
            $saltBase64 -cne $expectedSaltBase64 -or
            $storedKeyBase64 -cne $expectedStoredKeyBase64 -or
            $serverKeyBase64 -cne $expectedServerKeyBase64 -or
            -not $verifierMatch
        ) {
            throw (New-AfexStableException -Code 'FIXED_VECTOR_MISMATCH')
        }

        $swappedVerifier = 'SCRAM-SHA-256$4096:{0}${1}:{2}' -f $saltBase64, $serverKeyBase64, $storedKeyBase64
        $swappedStructurallyValid = $swappedVerifier -cmatch $script:AfexScramVerifierPattern
        $swappedKeyRejected = $swappedStructurallyValid -and -not (
            Test-AfexFixedTimeAsciiEqual -Left $swappedVerifier -Right $expectedVerifier
        )
        if (-not $swappedKeyRejected) {
            throw (New-AfexStableException -Code 'SWAPPED_KEY_REJECTION_FAILED')
        }

        return [pscustomobject]@{
            Result = 'PASS'
            SaltedPasswordMatch = $saltedPasswordMatch
            ClientKeyMatch = $clientKeyMatch
            StoredKeyMatch = $storedKeyMatch
            ServerKeyMatch = $serverKeyMatch
            VerifierMatch = $verifierMatch
            SwappedKeyRejected = $swappedKeyRejected
            IterationCount = 4096
            SaltLengthBytes = $saltCopy.Length
            SaltedPasswordLengthBytes = $saltedPassword.Length
            StoredKeyLengthBytes = $storedKey.Length
            ServerKeyLengthBytes = $serverKey.Length
            ContractVersion = $script:AfexScramContractVersion
        }
    }
    catch {
        if ($_.Exception.Message -in $script:AfexScramStableErrors) { throw }
        throw (New-AfexStableException -Code 'UNKNOWN_CRYPTOGRAPHIC_FAILURE')
    }
    finally {
        Clear-AfexByteArray -Bytes $saltCopy
        Clear-AfexByteArray -Bytes $saltedPassword
        Clear-AfexByteArray -Bytes $clientKey
        Clear-AfexByteArray -Bytes $storedKey
        Clear-AfexByteArray -Bytes $serverKey
        Clear-AfexByteArray -Bytes $expectedSaltedPassword
        Clear-AfexByteArray -Bytes $expectedClientKey
        Clear-AfexByteArray -Bytes $expectedStoredKey
        Clear-AfexByteArray -Bytes $expectedServerKey
        $derivation = $null
        $saltBase64 = $null
        $storedKeyBase64 = $null
        $serverKeyBase64 = $null
        $verifier = $null
        $swappedVerifier = $null
        $expectedVerifier = $null
    }
}
