package jp.ororo.catlog;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.io.OutputStream;
import java.io.IOException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final int INK = Color.rgb(40, 55, 47), GREEN = Color.rgb(54, 94, 78);
    private static final int MUTED = Color.rgb(102, 112, 103), PAPER = Color.rgb(247, 245, 239);
    private static final int[] COLORS = {0xFFF1E6DA, 0xFFE4EEDC, 0xFFFAEACC, 0xFFF3DFDA};
    private RecordStore store;
    private Cat selectedCat = Cat.MONET;
    private final EnumMap<Cat, View> catCards = new EnumMap<>(Cat.class);
    private final EnumMap<CatRecord.Type, Button> recordButtons = new EnumMap<>(CatRecord.Type.class);
    private Button unassignedButton;
    private TextView recordHeading, recordHint;
    private LocalDate selected = LocalDate.now();
    private YearMonth month = YearMonth.now();
    private LinearLayout content, calendar, history;
    private TextView monthTitle, historyTitle, historyCat, summary;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        String catName = getSharedPreferences("preferences", MODE_PRIVATE).getString("cat", Cat.MONET.name());
        if (state != null) catName = state.getString("cat", catName);
        try { selectedCat = Cat.valueOf(catName); }
        catch (IllegalArgumentException e) { selectedCat = Cat.MONET; }
        if (state != null) {
            selected = LocalDate.parse(state.getString("selected", LocalDate.now().toString()));
            month = YearMonth.parse(state.getString("month", YearMonth.now().toString()));
        }
        try { store = new RecordStore(getFilesDir()); }
        catch (IOException e) {
            TextView message = text("記録ファイルを読み込めませんでした。\n\n元のデータを守るため、書き込みを停止しています。空き容量などを確認してアプリを開き直してください。", 18, INK);
            message.setPadding(dp(24), dp(64), dp(24), dp(24));
            setContentView(message);
            return;
        }
        if (selectedCat == Cat.UNASSIGNED && store.forCat(Cat.UNASSIGNED).isEmpty()) selectedCat = Cat.MONET;
        buildScreen();
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        state.putString("selected", selected.toString()); state.putString("month", month.toString());
        state.putString("cat", selectedCat.name());
    }

    @Override protected void onResume() {
        super.onResume();
        if (calendar != null) refresh();
    }

    private void buildScreen() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true); scroll.setBackgroundColor(PAPER);
        content = column(); content.setPadding(dp(20), dp(16), dp(20), dp(32));
        scroll.addView(content);
        // Android 15 draws edge-to-edge. Keep all controls clear of system bars.
        scroll.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        setContentView(scroll);
        scroll.requestApplyInsets();

        TextView eyebrow = text("ORORO  /  CAT DIARY", 11, GREEN);
        eyebrow.setLetterSpacing(0.16f); content.addView(eyebrow);
        TextView title = text("ねこの、いつもを。", 29, INK); bold(title); space(title, 9, 5); content.addView(title);
        content.addView(text("小さな記録で、毎日の変化に気づく。", 13, MUTED));
        buildCatSelector();
        recordHeading = text("", 19, INK); bold(recordHeading); space(recordHeading, 22, 4); content.addView(recordHeading);
        recordHint = text("", 12, MUTED); space(recordHint, 0, 12); content.addView(recordHint);

        LinearLayout first = row(), second = row();
        for (CatRecord.Type type : CatRecord.Type.values()) {
            Button button = button(type.symbol + "  " + type.label, COLORS[type.ordinal()], INK);
            recordButtons.put(type, button);
            button.setMinHeight(dp(76)); button.setTextSize(17);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1);
            lp.setMargins(dp(3), dp(3), dp(3), dp(3));
            (type.ordinal() < 2 ? first : second).addView(button, lp);
            button.setOnClickListener(v -> {
                if (type == CatRecord.Type.FOOD) foodDialog();
                else add(type, null);
            });
        }
        content.addView(first); content.addView(second);
        TextView hint = text("ご飯の交換時に、残っている量を記録できます。", 12, MUTED);
        space(hint, 8, 0); content.addView(hint);
        section("記録カレンダー", "日付を選んで、その日のようすを確認");

        LinearLayout calendarCard = column(); calendarCard.setBackground(shape(Color.WHITE, 20));
        calendarCard.setPadding(dp(10), dp(10), dp(10), dp(12)); content.addView(calendarCard);
        LinearLayout navigation = row(); navigation.setGravity(Gravity.CENTER_VERTICAL);
        Button prev = button("‹", Color.WHITE, INK); prev.setContentDescription("前の月");
        Button next = button("›", Color.WHITE, INK); next.setContentDescription("次の月");
        monthTitle = text("", 19, INK); bold(monthTitle); monthTitle.setGravity(Gravity.CENTER);
        navigation.addView(prev, new LinearLayout.LayoutParams(dp(48), dp(48)));
        navigation.addView(monthTitle, new LinearLayout.LayoutParams(0, -2, 1));
        navigation.addView(next, new LinearLayout.LayoutParams(dp(48), dp(48)));
        prev.setOnClickListener(v -> { month = month.minusMonths(1); refreshCalendar(); });
        next.setOnClickListener(v -> { month = month.plusMonths(1); refreshCalendar(); });
        calendarCard.addView(navigation);
        LinearLayout weekdays = row();
        String[] names = {"月", "火", "水", "木", "金", "土", "日"};
        for (int i = 0; i < 7; i++) {
            TextView day = text(names[i], 12, i == 6 ? 0xFFAC655A : MUTED); day.setGravity(Gravity.CENTER);
            weekdays.addView(day, new LinearLayout.LayoutParams(0, dp(32), 1));
        }
        calendarCard.addView(weekdays);
        calendar = column(); calendarCard.addView(calendar);
        LinearLayout footer = row(); footer.setGravity(Gravity.CENTER_VERTICAL);
        TextView legend = text("数字の下は記録件数", 11, MUTED);
        footer.addView(legend, new LinearLayout.LayoutParams(0, -2, 1));
        Button today = button("今日へ", Color.WHITE, GREEN);
        footer.addView(today); calendarCard.addView(footer);
        today.setOnClickListener(v -> { selected = LocalDate.now(); month = YearMonth.from(selected); refresh(); });

        historyTitle = text("", 19, INK); bold(historyTitle); space(historyTitle, 24, 7); content.addView(historyTitle);
        historyCat = text("", 14, GREEN); bold(historyCat); space(historyCat, 0, 4); content.addView(historyCat);
        summary = text("", 12, MUTED); summary.setLineSpacing(dp(3), 1); content.addView(summary);
        history = column(); space(history, 12, 0); content.addView(history);
        Button export = button("すべての猫の記録を書き出す", PAPER, GREEN); space(export, 20, 4);
        export.setOnClickListener(v -> {
            if (store.all().isEmpty()) { toast("まだ記録がありません"); return; }
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json")
                .addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE, "ororo-" + LocalDate.now() + ".json");
            startActivityForResult(intent, 10);
        });
        content.addView(export);
        TextView privacy = text("記録はこの端末だけに保存されます。\nアプリを削除すると消えるため、必要に応じて書き出してください。", 11, MUTED);
        privacy.setGravity(Gravity.CENTER); privacy.setLineSpacing(dp(4), 1); content.addView(privacy);
        refresh();
    }

    private void section(String title, String subtitle) {
        TextView label = text(title, 19, INK); bold(label); space(label, 27, 4); content.addView(label);
        TextView description = text(subtitle, 12, MUTED); space(description, 0, 12); content.addView(description);
    }

    private void buildCatSelector() {
        LinearLayout profiles = row(); space(profiles, 20, 0); content.addView(profiles);
        for (Cat cat : new Cat[]{Cat.MONET, Cat.RENOIR}) {
            LinearLayout card = column(); card.setGravity(Gravity.CENTER); card.setPadding(dp(10), dp(12), dp(10), dp(12));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -1, 1); lp.setMargins(dp(3), 0, dp(3), 0);
            profiles.addView(card, lp);
            card.addView(new CatPortrait(this, cat), new LinearLayout.LayoutParams(dp(56), dp(56)));
            TextView name = text(cat.label, 17, INK); bold(name); card.addView(name);
            TextView description = text(cat.description, 11, MUTED); description.setGravity(Gravity.CENTER); card.addView(description);
            card.setContentDescription(cat.label + "を選択、" + cat.description);
            card.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
            card.setFocusable(true); card.setClickable(true);
            card.setOnClickListener(v -> selectCat(cat)); catCards.put(cat, card);
        }
        unassignedButton = button("", PAPER, MUTED); space(unassignedButton, 6, 0); content.addView(unassignedButton);
        unassignedButton.setContentDescription("未分類の記録を表示");
        unassignedButton.setOnClickListener(v -> selectCat(Cat.UNASSIGNED));
    }

    private void selectCat(Cat cat) {
        selectedCat = cat;
        getSharedPreferences("preferences", MODE_PRIVATE).edit().putString("cat", cat.name()).apply();
        refresh();
    }

    private void refreshCatSelector() {
        for (Cat cat : catCards.keySet()) {
            View card = catCards.get(cat); card.setSelected(cat == selectedCat);
            GradientDrawable background = shape(cat == selectedCat ? cat.color : Color.WHITE, 16);
            if (cat == selectedCat) background.setStroke(dp(2), GREEN);
            card.setBackground(background);
        }
        int unassigned = store.forCat(Cat.UNASSIGNED).size();
        unassignedButton.setVisibility(unassigned > 0 || selectedCat == Cat.UNASSIGNED ? View.VISIBLE : View.GONE);
        unassignedButton.setText(getString(R.string.unassigned_count, unassigned));
        unassignedButton.setSelected(selectedCat == Cat.UNASSIGNED);
        recordHeading.setText(selectedCat == Cat.UNASSIGNED ? "以前の未分類の記録" : getString(R.string.cat_record_heading, selectedCat.label));
        recordHint.setText(selectedCat == Cat.UNASSIGNED ? "以前の記録です。「猫を選ぶ」で振り分けてください。" : "ボタンを押した時刻で、選択中の猫に保存します");
        for (CatRecord.Type type : recordButtons.keySet()) {
            Button button = recordButtons.get(type); button.setEnabled(selectedCat != Cat.UNASSIGNED);
            button.setAlpha(selectedCat == Cat.UNASSIGNED ? 0.4f : 1f);
            button.setContentDescription(selectedCat.label + "の" + type.label + "を記録");
        }
    }

    private void refresh() { refreshCatSelector(); refreshCalendar(); refreshHistory(); }

    private void refreshCalendar() {
        calendar.removeAllViews(); monthTitle.setText(getString(R.string.calendar_month, month.getYear(), month.getMonthValue()));
        int offset = month.atDay(1).getDayOfWeek().getValue() - 1;
        int cells = ((offset + month.lengthOfMonth() + 6) / 7) * 7;
        List<CatRecord> all = store.forCat(selectedCat);
        ZoneId zone = ZoneId.systemDefault();
        for (int index = 0; index < cells;) {
            LinearLayout week = row(); calendar.addView(week);
            for (int col = 0; col < 7; col++, index++) {
                int number = index - offset + 1;
                TextView cell = text("", 14, INK); cell.setGravity(Gravity.CENTER); cell.setMinHeight(dp(52));
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1);
                lp.setMargins(dp(1), dp(2), dp(1), dp(2)); week.addView(cell, lp);
                if (number < 1 || number > month.lengthOfMonth()) continue;
                LocalDate date = month.atDay(number);
                long count = all.stream().filter(r -> r.date(zone).equals(date)).count();
                cell.setText(getString(R.string.calendar_day, number, count == 0 ? "·" : count + "件"));
                if (date.equals(selected)) { cell.setBackground(shape(GREEN, 12)); cell.setTextColor(Color.WHITE); }
                else if (date.equals(LocalDate.now())) { cell.setBackground(shape(0xFFE7EDE3, 12)); bold(cell); }
                cell.setContentDescription(date + "、記録" + count + "件");
                cell.setSelected(date.equals(selected)); cell.setFocusable(true); cell.setClickable(true);
                cell.setOnClickListener(v -> { selected = date; refresh(); });
            }
        }
    }

    private void refreshHistory() {
        history.removeAllViews();
        historyCat.setText(getString(R.string.cat_history, selectedCat.label));
        historyTitle.setText(getString(R.string.history_title, selected.format(DateTimeFormatter.ofPattern("M月d日（E）", Locale.JAPANESE))));
        List<CatRecord> day = new ArrayList<>();
        for (CatRecord r : store.forCat(selectedCat)) if (r.date(ZoneId.systemDefault()).equals(selected)) day.add(r);
        day.sort(Comparator.comparingLong((CatRecord r) -> r.timestamp).reversed());
        int[] counts = new int[4]; double total = 0;
        for (CatRecord r : day) { counts[r.type.ordinal()]++; if (r.grams != null) total += r.grams; }
        summary.setText(getString(R.string.daily_summary, counts[0], counts[1], counts[3], counts[2], grams(total)));
        if (day.isEmpty()) {
            TextView empty = text("この日の記録はまだありません。", 14, MUTED);
            empty.setGravity(Gravity.CENTER); empty.setPadding(dp(12), dp(28), dp(12), dp(28));
            empty.setBackground(shape(Color.WHITE, 16)); history.addView(empty); return;
        }
        for (CatRecord r : day) {
            LinearLayout item = row(); item.setGravity(Gravity.CENTER_VERTICAL);
            item.setPadding(dp(12), dp(8), dp(6), dp(8)); item.setBackground(shape(Color.WHITE, 14));
            space(item, 0, 7); history.addView(item);
            TextView symbol = text(r.type.symbol, 22, GREEN); symbol.setGravity(Gravity.CENTER);
            symbol.setBackground(shape(COLORS[r.type.ordinal()], 12));
            item.addView(symbol, new LinearLayout.LayoutParams(dp(42), dp(42)));
            LinearLayout labels = column(); labels.setPadding(dp(12), 0, 0, 0);
            TextView name = text(r.type.label + (r.grams == null ? "" : "　" + grams(r.grams) + " g"), 15, INK); bold(name);
            labels.addView(name);
            labels.addView(text(Instant.ofEpochMilli(r.timestamp).atZone(ZoneId.systemDefault())
                .format(DateTimeFormatter.ofPattern("HH:mm")), 12, MUTED));
            Button assign = button(r.cat == Cat.UNASSIGNED ? "猫を選ぶ" : "猫を変更", Color.WHITE, GREEN);
            assign.setTextSize(12); labels.addView(assign);
            assign.setOnClickListener(v -> assignDialog(r));
            item.addView(labels, new LinearLayout.LayoutParams(0, -2, 1));
            Button delete = button("削除", Color.WHITE, MUTED); delete.setTextSize(12);
            delete.setContentDescription(name.getText() + "の記録を削除"); item.addView(delete);
            delete.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle("この記録を削除しますか？")
                .setMessage(name.getText()).setNegativeButton("キャンセル", null)
                .setPositiveButton("削除", (dialog, which) -> {
                    try { store.delete(r.id); refresh(); toast("記録を削除しました"); }
                    catch (IOException e) { saveError(); }
                }).show());
        }
    }

    private void foodDialog() {
        EditText input = new EditText(this); input.setSingleLine(true); input.setTextSize(24);
        input.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        input.setHint("例：12.5"); input.setContentDescription("残っているご飯の量、グラム");
        LinearLayout panel = column(); panel.setPadding(dp(24), dp(8), dp(24), 0);
        panel.addView(text("残っているご飯は何グラム？", 15, INK)); panel.addView(input);
        panel.addView(text("単位：g ／ 食べきった場合は 0\n朝・夜など、ご飯を交換するときに記録します。", 12, MUTED));
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle(selectedCat.label + "のご飯廃棄を記録").setView(panel)
            .setNegativeButton("キャンセル", null).setPositiveButton("記録する", null).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try {
                String value = input.getText().toString().trim();
                if (!value.matches("[0-9]+(\\.[0-9]{1,2})?")) throw new IllegalArgumentException();
                double amount = Double.parseDouble(value);
                if (!Double.isFinite(amount) || amount < 0 || amount > 10000) throw new IllegalArgumentException();
                if (add(CatRecord.Type.FOOD, amount)) dialog.dismiss();
            } catch (IllegalArgumentException e) { input.setError("0〜10000 g を小数点以下2桁までで入力してください"); }
        }));
        dialog.show();
    }

    private boolean add(CatRecord.Type type, Double weight) {
        if (selectedCat == Cat.UNASSIGNED) { toast("記録する猫を選んでください"); return false; }
        try {
            CatRecord record = CatRecord.now(type, weight, selectedCat); store.add(record);
            selected = record.date(ZoneId.systemDefault()); month = YearMonth.from(selected);
            refresh(); toast(selectedCat.label + "の" + type.label + "を記録しました"); return true;
        } catch (IOException e) { saveError(); return false; }
    }

    private void assignDialog(CatRecord record) {
        new AlertDialog.Builder(this).setTitle("どちらの猫の記録ですか？")
            .setItems(new String[]{Cat.MONET.label, Cat.RENOIR.label}, (dialog, which) -> {
                Cat cat = which == 0 ? Cat.MONET : Cat.RENOIR;
                try { store.assignCat(record.id, cat); selectCat(cat); toast(cat.label + "の記録に変更しました"); }
                catch (IOException e) { saveError(); }
            }).setNegativeButton("キャンセル", null).show();
    }

    private void saveError() {
        new AlertDialog.Builder(this).setTitle("保存できませんでした")
            .setMessage("記録は変更されていません。端末の空き容量を確認して、もう一度お試しください。")
            .setPositiveButton("閉じる", null).show();
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != 10 || result != RESULT_OK || data == null || data.getData() == null) return;
        try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
            if (out == null) throw new IOException("No output stream");
            out.write(store.exportJson());
            toast("記録を書き出しました");
        } catch (IOException e) { toast("書き出せませんでした。保存先を確認してください。"); }
    }

    private String grams(double value) { return new java.text.DecimalFormat("0.##").format(value); }
    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_SHORT).show(); }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private LinearLayout column() { LinearLayout l = new LinearLayout(this); l.setOrientation(LinearLayout.VERTICAL); return l; }
    private LinearLayout row() { LinearLayout l = new LinearLayout(this); l.setOrientation(LinearLayout.HORIZONTAL); return l; }
    private TextView text(String value, int size, int color) {
        TextView t = new TextView(this); t.setText(value); t.setTextSize(size); t.setTextColor(color); return t;
    }
    private void bold(TextView t) { t.setTypeface(Typeface.DEFAULT, Typeface.BOLD); }
    private Button button(String title, int background, int color) {
        Button b = new Button(this); b.setText(title); b.setTextColor(color); b.setAllCaps(false);
        b.setTextSize(14); b.setMinWidth(0); b.setMinimumWidth(0); b.setMinHeight(dp(48));
        b.setPadding(dp(12), dp(8), dp(12), dp(8)); b.setBackground(shape(background, 16)); return b;
    }
    private GradientDrawable shape(int color, int radius) {
        GradientDrawable shape = new GradientDrawable(); shape.setColor(color); shape.setCornerRadius(dp(radius)); return shape;
    }
    private void space(View view, int top, int bottom) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, dp(top), 0, dp(bottom)); view.setLayoutParams(lp);
    }
}
