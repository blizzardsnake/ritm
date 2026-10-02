package ch.duartesantos.opengym;

import org.junit.Test;
import static org.junit.Assert.*;

public class PasswordVerifierTest {
    @Test public void verifierIsSaltedAndChecksUnicodeWithoutStoringPassword() throws Exception {
        String password = "fixture-пароль-1";
        String first = PasswordVerifier.create(password);
        String second = PasswordVerifier.create(password);
        assertNotEquals(first, second);
        assertFalse(first.contains(password));
        assertTrue(PasswordVerifier.verify(password, first));
        assertFalse(PasswordVerifier.verify("wrong", first));
    }
    @Test public void damagedAndWeakenedVerifiersAreNotAccepted() throws Exception {
        assertFalse(PasswordVerifier.wellFormed("1:a:b"));
        assertFalse(PasswordVerifier.wellFormed("damaged"));
        try { PasswordVerifier.verify("fixture-password", "damaged"); fail("must fail closed"); }
        catch (IllegalArgumentException expected) {}
        try { PasswordVerifier.create("short"); fail("must require 8 characters"); }
        catch (IllegalArgumentException expected) {}
    }
}
