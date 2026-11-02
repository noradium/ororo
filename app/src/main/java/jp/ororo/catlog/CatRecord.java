package jp.ororo.catlog;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

public final class CatRecord {
    public enum Type {
        POOP("うんち", "●"), PEE("おしっこ", "◆"), FOOD("ご飯廃棄", "◒"), VOMIT("嘔吐", "▲");
        public final String label;
        public final String symbol;
        Type(String label, String symbol) { this.label = label; this.symbol = symbol; }
    }

    public final String id;
    public final long timestamp;
    public final Type type;
    public final Double grams;
    public final Cat cat;

    /** Records created before multi-cat support have no known owner. */
    public CatRecord(String id, long timestamp, Type type, Double grams) {
        this(id, timestamp, type, grams, Cat.UNASSIGNED);
    }

    public CatRecord(String id, long timestamp, Type type, Double grams, Cat cat) {
        if (id == null || id.isEmpty() || timestamp < 0 || type == null || cat == null)
            throw new IllegalArgumentException("Invalid record");
        if (type == Type.FOOD) {
            if (grams == null || !Double.isFinite(grams) || grams < 0 || grams > 10000)
                throw new IllegalArgumentException("Invalid remaining food weight");
        } else if (grams != null) throw new IllegalArgumentException("Unexpected weight");
        this.id = id; this.timestamp = timestamp; this.type = type; this.grams = grams; this.cat = cat;
    }

    public static CatRecord now(Type type, Double grams, Cat cat) {
        if (cat == Cat.UNASSIGNED) throw new IllegalArgumentException("Choose a cat for new records");
        return new CatRecord(UUID.randomUUID().toString(), System.currentTimeMillis(), type, grams, cat);
    }

    public LocalDate date(ZoneId zone) { return Instant.ofEpochMilli(timestamp).atZone(zone).toLocalDate(); }
}
