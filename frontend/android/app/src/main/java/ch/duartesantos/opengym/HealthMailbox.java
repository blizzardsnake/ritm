package ch.duartesantos.opengym;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.concurrent.ConcurrentHashMap;

/** Durable queue. Same window/permissions coalesce; older windows remain until imported. */
final class HealthMailbox {
    static final class Entry {
        final String generation, payload;
        private final File file;
        private final String encoded;
        Entry(File file, String encoded) throws IOException {
            int newline = encoded.indexOf('\n');
            if (newline < 1) throw new IOException("Damaged health import queue");
            this.file = file; this.encoded = encoded;
            generation = encoded.substring(0, newline); payload = encoded.substring(newline + 1);
            if (!validGeneration(generation)) throw new IOException("Damaged health import generation");
        }
    }
    private static final ConcurrentHashMap<String, Object> LOCKS = new ConcurrentHashMap<>();
    private final File directory;
    private final Object lock;
    HealthMailbox(File directory) {
        this.directory = directory.getAbsoluteFile();
        lock = LOCKS.computeIfAbsent(this.directory.toPath().normalize().toString(), key -> new Object());
    }
    private static boolean validGeneration(String generation) { return generation != null && generation.matches("[A-Za-z0-9_-]{1,96}"); }
    private static String scopeName(String scope) throws IOException {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(scope.getBytes(StandardCharsets.UTF_8));
            StringBuilder text = new StringBuilder();
            for (byte value : hash) text.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
            return text + ".queue";
        } catch (NoSuchAlgorithmException e) { throw new IOException(e); }
    }
    void publish(String scope, String generation, String payload) throws IOException {
        if (scope == null || scope.isEmpty() || !validGeneration(generation) || payload == null) throw new IOException("Invalid health import generation");
        synchronized (lock) {
            new AtomicHealthFile(new File(directory, scopeName(scope))).write(generation + "\n" + payload);
        }
    }
    private ArrayList<Entry> entries() throws IOException {
        ArrayList<Entry> entries = new ArrayList<>();
        if (!directory.exists()) return entries;
        File[] files = directory.listFiles((folder, name) -> name.endsWith(".queue"));
        if (files == null) throw new IOException("Cannot read health import queue");
        for (File file : files) {
            String encoded = new AtomicHealthFile(file).read();
            if (encoded != null) entries.add(new Entry(file, encoded));
        }
        entries.sort(Comparator.comparing(entry -> entry.generation));
        return entries;
    }
    Entry read() throws IOException {
        synchronized (lock) {
            ArrayList<Entry> entries = entries();
            return entries.isEmpty() ? null : entries.get(0);
        }
    }
    boolean ack(String generation, boolean archive) throws IOException {
        if (!validGeneration(generation)) throw new IOException("Invalid health import generation");
        synchronized (lock) {
            for (Entry entry : entries()) if (entry.generation.equals(generation)) {
                if (archive) new AtomicHealthFile(new File(directory, "archive/" + generation + ".json")).write(entry.payload);
                return new AtomicHealthFile(entry.file).replaceIf(entry.encoded, null);
            }
            return false;
        }
    }
}
