package jp.ororo.catlog;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.nio.file.AtomicMoveNotSupportedException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** All mutations persist first; a failed write never changes the in-memory records. */
public final class RecordStore {
    private final File file;
    private List<CatRecord> records = new ArrayList<>();

    public RecordStore(File directory) throws IOException {
        file = new File(directory, "records.json");
        if (!directory.isDirectory()) throw new IOException("Storage directory unavailable");
        if (file.exists()) {
            try {
                JSONObject root = new JSONObject(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
                int version = root.getInt("version");
                if (version != 1 && version != 2) throw new IOException("Unsupported data version");
                JSONArray rows = root.getJSONArray("records");
                Set<String> ids = new HashSet<>();
                for (int i = 0; i < rows.length(); i++) {
                    JSONObject row = rows.getJSONObject(i);
                    CatRecord record = new CatRecord(row.getString("id"), row.getLong("timestamp"),
                        CatRecord.Type.valueOf(row.getString("type")), row.isNull("grams") ? null : row.getDouble("grams"),
                        version == 1 ? Cat.UNASSIGNED : Cat.valueOf(row.getString("cat")));
                    if (!ids.add(record.id)) throw new IOException("Duplicate record ID");
                    records.add(record);
                }
            } catch (Exception e) { throw new IOException("Cannot read saved records", e); }
        }
    }

    public List<CatRecord> all() { return new ArrayList<>(records); }

    /** Export all cats in the current schema, without rewriting a legacy source file. */
    public byte[] exportJson() throws IOException { return encode(records); }

    public List<CatRecord> forCat(Cat cat) {
        List<CatRecord> matching = new ArrayList<>();
        for (CatRecord record : records) if (record.cat == cat) matching.add(record);
        return matching;
    }

    public void assignCat(String id, Cat cat) throws IOException {
        if (cat == null || cat == Cat.UNASSIGNED) throw new IllegalArgumentException("Choose a named cat");
        List<CatRecord> next = all();
        for (int i = 0; i < next.size(); i++) {
            CatRecord record = next.get(i);
            if (record.id.equals(id)) {
                next.set(i, new CatRecord(record.id, record.timestamp, record.type, record.grams, cat));
                save(next);
                return;
            }
        }
        throw new IOException("Record not found");
    }

    public void add(CatRecord record) throws IOException {
        List<CatRecord> next = all();
        for (CatRecord existing : next) if (existing.id.equals(record.id)) throw new IOException("Duplicate record ID");
        next.add(record);
        save(next);
    }

    public void delete(String id) throws IOException {
        List<CatRecord> next = all();
        next.removeIf(record -> record.id.equals(id));
        save(next);
    }

    private void save(List<CatRecord> next) throws IOException {
        File temporary = new File(file.getParentFile(), "records.json.tmp");
        try {
            byte[] bytes = encode(next);
            try (FileOutputStream output = new FileOutputStream(temporary)) {
                output.write(bytes);
                output.getFD().sync();
            }
            try {
                Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING);
            }
            records = next;
        } catch (Exception e) { throw new IOException("Cannot save records", e); }
        finally { if (temporary.exists()) temporary.delete(); }
    }

    private static byte[] encode(List<CatRecord> records) throws IOException {
        try {
            JSONArray rows = new JSONArray();
            for (CatRecord record : records) {
                rows.put(new JSONObject().put("id", record.id).put("timestamp", record.timestamp)
                    .put("type", record.type.name()).put("cat", record.cat.name())
                    .put("grams", record.grams == null ? JSONObject.NULL : record.grams));
            }
            return new JSONObject().put("version", 2).put("records", rows).toString(2).getBytes(StandardCharsets.UTF_8);
        } catch (Exception e) { throw new IOException("Cannot encode records", e); }
    }
}
