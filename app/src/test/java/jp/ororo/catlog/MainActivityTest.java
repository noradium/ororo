package jp.ororo.catlog;

import android.app.AlertDialog;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.TextView;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlertDialog;
import java.io.File;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class MainActivityTest {
    @Before public void clearRecords() {
        new File(RuntimeEnvironment.getApplication().getFilesDir(), "records.json").delete();
        RuntimeEnvironment.getApplication().getSharedPreferences("preferences", 0).edit().clear().commit();
    }

    @Test public void quickButtonsPersistAndSurviveActivityRecreation() throws Exception {
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity activity = controller.get();
            find(activity.getWindow().getDecorView(), "●  うんち").performClick();
            find(activity.getWindow().getDecorView(), "◆  おしっこ").performClick();
            find(activity.getWindow().getDecorView(), "▲  嘔吐").performClick();
            assertEquals(3, new RecordStore(activity.getFilesDir()).all().size());
            controller.recreate();
            assertNotNull(find(controller.get().getWindow().getDecorView(), "うんち"));
            assertEquals(3, new RecordStore(activity.getFilesDir()).all().size());
        }
    }

    @Test public void foodDialogRejectsEmptyInputAndRecordsZero() throws Exception {
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity activity = controller.get();
            find(activity.getWindow().getDecorView(), "◒  ご飯廃棄").performClick();
            shadowOf(Looper.getMainLooper()).idle();
            AlertDialog dialog = ShadowAlertDialog.getLatestAlertDialog();
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick();
            shadowOf(Looper.getMainLooper()).idle();
            assertTrue(dialog.isShowing());
            assertEquals(0, new RecordStore(activity.getFilesDir()).all().size());
            EditText input = edit(dialog.getWindow().getDecorView());
            input.setText("0"); dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick();
            shadowOf(Looper.getMainLooper()).idle();
            assertFalse(dialog.isShowing());
            assertEquals(0.0, new RecordStore(activity.getFilesDir()).all().get(0).grams, 0.0);
        }
    }

    @Test public void deletionRequiresConfirmationAndPersists() throws Exception {
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity activity = controller.get(); View root = activity.getWindow().getDecorView();
            find(root, "●  うんち").performClick();
            find(root, "削除").performClick();
            AlertDialog dialog = ShadowAlertDialog.getLatestAlertDialog();
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).performClick();
            shadowOf(Looper.getMainLooper()).idle();
            assertEquals(1, new RecordStore(activity.getFilesDir()).all().size());
            find(root, "削除").performClick();
            ShadowAlertDialog.getLatestAlertDialog().getButton(AlertDialog.BUTTON_POSITIVE).performClick();
            shadowOf(Looper.getMainLooper()).idle();
            assertEquals(0, new RecordStore(activity.getFilesDir()).all().size());
            assertNotNull(find(root, "この日の記録はまだありません。"));
        }
    }

    @Test @Config(sdk = 26) public void calendarCanOpenAPreviousMonthAndReturnToToday() throws Exception {
        LocalDate past = YearMonth.now().minusMonths(1).atDay(1);
        new RecordStore(RuntimeEnvironment.getApplication().getFilesDir()).add(
            new CatRecord("past", past.atTime(12, 0).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli(), CatRecord.Type.POOP, null, Cat.MONET));
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            View root = controller.get().getWindow().getDecorView();
            find(root, "‹").performClick();
            View dateCell = described(root, past + "、記録1件");
            assertNotNull(dateCell); dateCell.performClick();
            assertNotNull(find(root, "うんち"));
            assertNotNull(find(root, past.format(DateTimeFormatter.ofPattern("M月d日（E）", Locale.JAPANESE)) + " の記録"));
            find(root, "今日へ").performClick();
            assertNotNull(find(root, LocalDate.now().format(DateTimeFormatter.ofPattern("M月d日（E）", Locale.JAPANESE)) + " の記録"));
            assertNotNull(find(root, "この日の記録はまだありません。"));
        }
    }

    @Test public void switchingCatsSeparatesCalendarHistoryAndFoodAndRemembersSelection() throws Exception {
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity activity = controller.get(); View root = activity.getWindow().getDecorView();
            find(root, "●  うんち").performClick();
            choose(root, Cat.RENOIR);
            assertNotNull(find(root, "この日の記録はまだありません。"));
            assertNotNull(described(root, LocalDate.now() + "、記録0件"));
            find(root, "◒  ご飯廃棄").performClick(); shadowOf(Looper.getMainLooper()).idle();
            AlertDialog dialog = ShadowAlertDialog.getLatestAlertDialog();
            assertNotNull(find(dialog.getWindow().getDecorView(), "ルノワールのご飯廃棄を記録"));
            edit(dialog.getWindow().getDecorView()).setText("12.5");
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick(); shadowOf(Looper.getMainLooper()).idle();
            assertNotNull(described(root, LocalDate.now() + "、記録1件"));
            assertNotNull(find(root, "ご飯廃棄　12.5 g"));
            RecordStore saved = new RecordStore(activity.getFilesDir());
            assertEquals(CatRecord.Type.POOP, saved.forCat(Cat.MONET).get(0).type);
            assertEquals(12.5, saved.forCat(Cat.RENOIR).get(0).grams, 0.0);
            choose(root, Cat.MONET);
            assertNotNull(find(root, "うんち")); assertNull(find(root, "ご飯廃棄　12.5 g"));
            choose(root, Cat.RENOIR); controller.recreate();
            assertNotNull(find(controller.get().getWindow().getDecorView(), "ルノワールのようすを記録"));
        }
        try (ActivityController<MainActivity> reopened = Robolectric.buildActivity(MainActivity.class).setup()) {
            assertNotNull(find(reopened.get().getWindow().getDecorView(), "ルノワールのようすを記録"));
        }
    }

    @Test public void legacyRecordsAreUnassignedAndCanBeAssignedInTheUi() throws Exception {
        File directory = RuntimeEnvironment.getApplication().getFilesDir();
        String legacy = "{\"version\":1,\"records\":[{\"id\":\"legacy\",\"timestamp\":" + System.currentTimeMillis() + ",\"type\":\"POOP\",\"grams\":null}]}";
        java.nio.file.Files.write(new File(directory, "records.json").toPath(), legacy.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            View root = controller.get().getWindow().getDecorView();
            assertNotNull(find(root, "この日の記録はまだありません。"));
            described(root, "未分類の記録を表示").performClick();
            assertFalse(find(root, "●  うんち").isEnabled());
            assertNotNull(find(root, "うんち"));
            find(root, "猫を選ぶ").performClick();
            AlertDialog dialog = ShadowAlertDialog.getLatestAlertDialog();
            dialog.getListView().performItemClick(null, 1, 1); shadowOf(Looper.getMainLooper()).idle();
            assertNotNull(find(root, "ルノワールのようすを記録"));
            assertNotNull(find(root, "うんち"));
            assertTrue(new RecordStore(directory).forCat(Cat.UNASSIGNED).isEmpty());
            assertEquals(Cat.RENOIR, new RecordStore(directory).all().get(0).cat);
            assertEquals(View.GONE, described(root, "未分類の記録を表示").getVisibility());
        }
    }

    private static void choose(View root, Cat cat) {
        described(root, cat.label + "を選択、" + cat.description).performClick();
    }

    private static View described(View view, String description) {
        if (description.contentEquals(view.getContentDescription() == null ? "" : view.getContentDescription())) return view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                View found = described(group.getChildAt(i), description); if (found != null) return found;
            }
        }
        return null;
    }

    private static View find(View view, String text) {
        if (view instanceof TextView && ((TextView) view).getText().toString().equals(text)) return view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                View found = find(group.getChildAt(i), text); if (found != null) return found;
            }
        }
        return null;
    }

    private static EditText edit(View view) {
        if (view instanceof EditText) return (EditText) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                EditText found = edit(group.getChildAt(i)); if (found != null) return found;
            }
        }
        return null;
    }
}
