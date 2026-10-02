package ch.duartesantos.opengym;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** The reader and background worker publish whole generations in one process. */
final class AtomicHealthFile {
    interface MoveOperation { void move(File from, File to) throws IOException; }
    private static final ConcurrentHashMap<String, Object> LOCKS = new ConcurrentHashMap<>();
    private final File target;
    private final Object lock;
    private final MoveOperation move;

    AtomicHealthFile(File target) {
        this(target, (from, to) -> Files.move(from.toPath(), to.toPath(),
                StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING));
    }

    AtomicHealthFile(File target, MoveOperation move) {
        this.target = target.getAbsoluteFile();
        this.move = move;
        this.lock = LOCKS.computeIfAbsent(this.target.toPath().normalize().toString(), key -> new Object());
    }

    String read() throws IOException {
        synchronized (lock) {
            return target.exists() ? new String(Files.readAllBytes(target.toPath()), StandardCharsets.UTF_8) : null;
        }
    }

    void write(String text) throws IOException {
        synchronized (lock) {
            File parent = target.getParentFile();
            if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("Cannot create health storage");
            File temporary = new File(parent, target.getName() + "." + UUID.randomUUID() + ".tmp");
            try {
                try (FileOutputStream output = new FileOutputStream(temporary)) {
                    output.write(text.getBytes(StandardCharsets.UTF_8));
                    output.getFD().sync();
                }
                move.move(temporary, target);
            } finally {
                Files.deleteIfExists(temporary.toPath());
            }
        }
    }

    boolean replaceIf(String expected, String replacement) throws IOException {
        synchronized (lock) {
            if (!Objects.equals(read(), expected)) return false;
            if (replacement == null) Files.deleteIfExists(target.toPath());
            else write(replacement);
            return true;
        }
    }
}
