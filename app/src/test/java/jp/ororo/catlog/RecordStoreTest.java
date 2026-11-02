package jp.ororo.catlog;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import static org.junit.Assert.*;

public class RecordStoreTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();

    @Test public void allFourTypesSurviveReopeningAndDeletion() throws Exception {
        File directory = temporary.newFolder();
        RecordStore store = new RecordStore(directory);
        for (CatRecord.Type type : CatRecord.Type.values()) {
            store.add(new CatRecord(type.name(), 1234, type, type == CatRecord.Type.FOOD ? 12.5 : null));
        }
        RecordStore reopened = new RecordStore(directory);
        assertEquals(4, reopened.all().size());
        assertEquals(12.5, reopened.all().get(2).grams, 0.001);
        assertNull(reopened.all().get(0).grams);
        reopened.delete("PEE");
        RecordStore afterDelete = new RecordStore(directory);
        assertEquals(3, afterDelete.all().size());
        assertFalse(afterDelete.all().stream().anyMatch(r -> r.type == CatRecord.Type.PEE));
    }

    @Test public void zeroGramsIsAValidRecordedMeal() throws Exception {
        File directory = temporary.newFolder();
        new RecordStore(directory).add(new CatRecord("zero", 0, CatRecord.Type.FOOD, 0.0));
        assertEquals(0.0, new RecordStore(directory).all().get(0).grams, 0.0);
    }

    @Test public void corruptFileIsNotSilentlyReplaced() throws Exception {
        File directory = temporary.newFolder(); File data = new File(directory, "records.json");
        Files.write(data.toPath(), "broken json".getBytes(StandardCharsets.UTF_8));
        assertThrows(IOException.class, () -> new RecordStore(directory));
        assertEquals("broken json", new String(Files.readAllBytes(data.toPath()), StandardCharsets.UTF_8));
    }

    @Test public void unsupportedSchemaIsPreserved() throws Exception {
        File directory = temporary.newFolder(); File data = new File(directory, "records.json");
        Files.write(data.toPath(), "{\"version\":3,\"records\":[]}".getBytes(StandardCharsets.UTF_8));
        assertThrows(IOException.class, () -> new RecordStore(directory));
        assertTrue(new String(Files.readAllBytes(data.toPath()), StandardCharsets.UTF_8).contains("3"));
    }

    @Test public void failedWriteKeepsOriginalFileAndInMemoryRecords() throws Exception {
        File directory = temporary.newFolder(); RecordStore store = new RecordStore(directory);
        store.add(new CatRecord("first", 1, CatRecord.Type.POOP, null));
        assertTrue(new File(directory, "records.json.tmp").mkdir());
        Files.write(new File(directory, "records.json.tmp/blocker").toPath(), "block".getBytes(StandardCharsets.UTF_8));
        assertThrows(IOException.class, () -> store.add(new CatRecord("second", 2, CatRecord.Type.PEE, null)));
        assertEquals(1, store.all().size());
        assertEquals(1, new RecordStore(directory).all().size());
    }

    @Test public void calendarUsesLocalDayAcrossMonthAndYearBoundary() {
        long timestamp = Instant.parse("2026-12-31T16:00:00Z").toEpochMilli();
        CatRecord record = new CatRecord("boundary", timestamp, CatRecord.Type.VOMIT, null);
        assertEquals(LocalDate.of(2027, 1, 1), record.date(ZoneId.of("Asia/Tokyo")));
        assertEquals(LocalDate.of(2026, 12, 31), record.date(ZoneId.of("UTC")));
    }

    @Test public void invalidWeightsAreRejected() {
        for (double grams : new double[]{-1, Double.NaN, Double.POSITIVE_INFINITY, 10001}) {
            assertThrows(IllegalArgumentException.class, () -> new CatRecord("bad", 1, CatRecord.Type.FOOD, grams));
        }
        assertThrows(IllegalArgumentException.class, () -> new CatRecord("bad", 1, CatRecord.Type.FOOD, null));
        assertThrows(IllegalArgumentException.class, () -> new CatRecord("bad", 1, CatRecord.Type.PEE, 1.0));
    }

    @Test public void catsStaySeparateAcrossReopeningReassignmentAndDeletion() throws Exception {
        File directory = temporary.newFolder(); RecordStore store = new RecordStore(directory);
        store.add(new CatRecord("monet-food", 1, CatRecord.Type.FOOD, 12.5, Cat.MONET));
        store.add(new CatRecord("renoir-food", 2, CatRecord.Type.FOOD, 3.0, Cat.RENOIR));
        store = new RecordStore(directory);
        assertEquals(12.5, store.forCat(Cat.MONET).get(0).grams, 0.0);
        assertEquals(3.0, store.forCat(Cat.RENOIR).get(0).grams, 0.0);
        store.assignCat("monet-food", Cat.RENOIR);
        store = new RecordStore(directory);
        assertTrue(store.forCat(Cat.MONET).isEmpty());
        assertEquals(2, store.forCat(Cat.RENOIR).size());
        assertEquals(1, store.forCat(Cat.RENOIR).get(0).timestamp);
        store.delete("renoir-food");
        assertEquals("monet-food", new RecordStore(directory).forCat(Cat.RENOIR).get(0).id);
    }

    @Test public void legacyFileRemainsUnchangedUntilUserAssignsItsRecords() throws Exception {
        File directory = temporary.newFolder(); File data = new File(directory, "records.json");
        String legacy = "{\"version\":1,\"records\":[{\"id\":\"old\",\"timestamp\":1234,\"type\":\"FOOD\",\"grams\":4.5}]}";
        Files.write(data.toPath(), legacy.getBytes(StandardCharsets.UTF_8));
        RecordStore store = new RecordStore(directory);
        assertEquals(legacy, new String(Files.readAllBytes(data.toPath()), StandardCharsets.UTF_8));
        assertEquals(1, store.forCat(Cat.UNASSIGNED).size());
        assertTrue(store.forCat(Cat.MONET).isEmpty());
        assertTrue(store.forCat(Cat.RENOIR).isEmpty());
        org.json.JSONObject exported = new org.json.JSONObject(new String(store.exportJson(), StandardCharsets.UTF_8));
        assertEquals(2, exported.getInt("version"));
        assertEquals("UNASSIGNED", exported.getJSONArray("records").getJSONObject(0).getString("cat"));
        assertEquals(legacy, new String(Files.readAllBytes(data.toPath()), StandardCharsets.UTF_8));
        store.add(new CatRecord("new", 5678, CatRecord.Type.PEE, null, Cat.MONET));
        store = new RecordStore(directory);
        assertEquals(1, store.forCat(Cat.UNASSIGNED).size());
        store.assignCat("old", Cat.RENOIR);
        store = new RecordStore(directory);
        assertTrue(store.forCat(Cat.UNASSIGNED).isEmpty());
        CatRecord migrated = store.forCat(Cat.RENOIR).get(0);
        assertEquals("old", migrated.id); assertEquals(1234, migrated.timestamp);
        assertEquals(CatRecord.Type.FOOD, migrated.type); assertEquals(4.5, migrated.grams, 0.0);
        assertEquals(1, store.forCat(Cat.MONET).size());
        org.json.JSONObject json = new org.json.JSONObject(new String(Files.readAllBytes(data.toPath()), StandardCharsets.UTF_8));
        assertEquals(2, json.getInt("version"));
    }

    @Test public void failedReassignmentPreservesOwnerOnDiskAndInMemory() throws Exception {
        File directory = temporary.newFolder(); RecordStore store = new RecordStore(directory);
        store.add(new CatRecord("record", 1, CatRecord.Type.POOP, null, Cat.MONET));
        assertTrue(new File(directory, "records.json.tmp").mkdir());
        Files.write(new File(directory, "records.json.tmp/blocker").toPath(), new byte[]{1});
        assertThrows(IOException.class, () -> store.assignCat("record", Cat.RENOIR));
        assertEquals(Cat.MONET, store.all().get(0).cat);
        assertEquals(Cat.MONET, new RecordStore(directory).all().get(0).cat);
    }

    @Test public void unknownCatInVersionTwoCannotBeSilentlyReplaced() throws Exception {
        File directory = temporary.newFolder(); File data = new File(directory, "records.json");
        String unknown = "{\"version\":2,\"records\":[{\"id\":\"old\",\"timestamp\":1,\"type\":\"PEE\",\"grams\":null,\"cat\":\"OTHER\"}]}";
        Files.write(data.toPath(), unknown.getBytes(StandardCharsets.UTF_8));
        assertThrows(IOException.class, () -> new RecordStore(directory));
        assertEquals(unknown, new String(Files.readAllBytes(data.toPath()), StandardCharsets.UTF_8));
        assertThrows(IllegalArgumentException.class, () -> CatRecord.now(CatRecord.Type.POOP, null, Cat.UNASSIGNED));
    }
}
