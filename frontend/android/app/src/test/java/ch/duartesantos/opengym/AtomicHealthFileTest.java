package ch.duartesantos.opengym;

import org.junit.Test;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import static org.junit.Assert.*;

public class AtomicHealthFileTest {
    @Test public void failedPublishKeepsPreviousAndAckCannotRemoveNewGeneration() throws Exception {
        File folder = Files.createTempDirectory("opengym-health").toFile();
        File target = new File(folder, "mailbox.json");
        AtomicHealthFile mailbox = new AtomicHealthFile(target);
        mailbox.write("generation-1");
        AtomicHealthFile failing = new AtomicHealthFile(target, (from, to) -> { throw new IOException("interrupted"); });
        try { failing.write("partial"); fail("expected interrupted write"); } catch (IOException expected) {}
        assertEquals("generation-1", mailbox.read());
        mailbox.write("generation-2");
        assertFalse(mailbox.replaceIf("generation-1", null));
        assertEquals("generation-2", mailbox.read());
        assertTrue(mailbox.replaceIf("generation-2", null));
        assertNull(mailbox.read());
        assertEquals(0, folder.listFiles().length);
        Files.delete(folder.toPath());
    }
}
