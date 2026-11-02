package jp.ororo.catlog;

/** Stable identifiers are saved independently of the labels shown on screen. */
public enum Cat {
    MONET("モネ", "グレーのブリティッシュショートヘアー", 0xFFE4E8ED),
    RENOIR("ルノワール", "白のラガマフィン", 0xFFF5EDDF),
    UNASSIGNED("未分類", "以前の記録・猫を選んで振り分け", 0xFFEAE7DF);

    public final String label;
    public final String description;
    public final int color;

    Cat(String label, String description, int color) {
        this.label = label; this.description = description; this.color = color;
    }
}
