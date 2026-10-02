package ch.duartesantos.opengym;

import org.junit.Test;
import java.io.File;
import java.nio.file.Files;
import static org.junit.Assert.*;

public class HealthMailboxTest {
    @Test public void retainsEarlierWindowsAndOnlyCoalescesIdenticalScope() throws Exception {
        File directory = Files.createTempDirectory("ritm-health-queue").toFile();
        try {
            HealthMailbox mailbox = new HealthMailbox(directory);
            mailbox.publish("owner|mi|oct1|full", "100-a", "first");
            mailbox.publish("owner|mi|oct2|full", "200-a", "second");
            mailbox.publish("owner|mi|oct2|full", "300-a", "corrected");
            assertEquals("first", mailbox.read().payload);
            assertTrue(mailbox.ack("100-a", false));
            assertEquals("corrected", mailbox.read().payload);
            // A denial must not overwrite an unimported complete snapshot.
            mailbox.publish("owner|mi|oct2|denied", "400-a", "denied");
            assertTrue(mailbox.ack("300-a", false));
            assertEquals("denied", mailbox.read().payload);
            assertTrue(mailbox.ack("400-a", false));
            assertNull(mailbox.read());
        } finally { deleteFixture(directory); }
    }
    @Test public void staleAcknowledgementCannotRemoveNewGenerationAndForeignProfileIsArchived() throws Exception {
        File directory = Files.createTempDirectory("ritm-health-queue").toFile();
        try {
            HealthMailbox first = new HealthMailbox(directory), worker = new HealthMailbox(directory);
            first.publish("same-window", "100-a", "old");
            HealthMailbox.Entry read = first.read();
            worker.publish("same-window", "200-a", "new");
            assertFalse(first.ack(read.generation, false));
            assertEquals("new", first.read().payload);
            assertTrue(first.ack("200-a", true));
            assertNull(first.read());
            assertEquals("new", new String(Files.readAllBytes(new File(directory, "archive/200-a.json").toPath()), java.nio.charset.StandardCharsets.UTF_8));
        } finally { deleteFixture(directory); }
    }
    private static void deleteFixture(File directory) throws Exception {
        try (var paths = Files.walk(directory.toPath())) {
            for (var path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) Files.delete(path);
        }
    }
}
