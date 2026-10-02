package ch.duartesantos.opengym;

import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

final class PasswordVerifier {
    static final int ITERATIONS = 600000;
    static void validate(String password) {
        if (password == null || password.codePointCount(0, password.length()) < 8
                || password.codePointCount(0, password.length()) > 128) throw new IllegalArgumentException("Use 8–128 characters for your password");
    }
    static String create(String password) throws GeneralSecurityException {
        validate(password);
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        return ITERATIONS + ":" + Base64.getEncoder().encodeToString(salt) + ":"
                + Base64.getEncoder().encodeToString(derive(password, salt));
    }
    static boolean wellFormed(String encoded) {
        try {
            String[] fields = encoded.split(":", -1);
            return fields.length == 3 && fields[0].equals(String.valueOf(ITERATIONS))
                    && Base64.getDecoder().decode(fields[1]).length == 16 && Base64.getDecoder().decode(fields[2]).length == 32;
        } catch (RuntimeException e) { return false; }
    }
    static boolean verify(String password, String encoded) throws GeneralSecurityException {
        if (!wellFormed(encoded)) throw new IllegalArgumentException("App protection settings could not be read. Retry without deleting your data.");
        if (password == null || password.length() > 512) return false;
        String[] fields = encoded.split(":", -1);
        return MessageDigest.isEqual(Base64.getDecoder().decode(fields[2]), derive(password, Base64.getDecoder().decode(fields[1])));
    }
    private static byte[] derive(String password, byte[] salt) throws GeneralSecurityException {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, ITERATIONS, 256);
        try { return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded(); }
        finally { spec.clearPassword(); }
    }
}
