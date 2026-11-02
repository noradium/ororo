package jp.ororo.catlog;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.View;

/** Small vector portraits: a round grey shorthair and a fluffy white longhair. */
final class CatPortrait extends View {
    private final Cat cat;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path ears = new Path(), inner = new Path(), nose = new Path();

    public CatPortrait(Context context) { this(context, Cat.MONET); }

    CatPortrait(Context context, Cat cat) {
        super(context); this.cat = cat; setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        ears.moveTo(21, 44); ears.lineTo(20, 12); ears.lineTo(43, 31);
        ears.lineTo(57, 31); ears.lineTo(80, 12); ears.lineTo(79, 44); ears.close();
        inner.moveTo(26, 31); inner.lineTo(26, 22); inner.lineTo(36, 31);
        inner.moveTo(64, 31); inner.lineTo(74, 22); inner.lineTo(74, 31);
        nose.moveTo(46, 63); nose.lineTo(54, 63); nose.lineTo(50, 67); nose.close();
    }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        canvas.save(); canvas.scale(getWidth() / 100f, getHeight() / 100f);
        boolean grey = cat == Cat.MONET;
        int fur = grey ? 0xFF929EAC : 0xFFFFFEF9;
        paint.setColor(cat.color); canvas.drawCircle(50, 50, 49, paint);
        paint.setColor(grey ? 0xFF778596 : 0xFFDFDACF);
        canvas.drawOval(18, 26, 82, 87, paint);
        paint.setColor(fur);
        canvas.drawPath(ears, paint);
        if (!grey) {
            for (int i = 0; i < 12; i++) {
                double angle = i * Math.PI / 6;
                canvas.drawCircle(50 + (float)Math.cos(angle) * 27, 54 + (float)Math.sin(angle) * 25, 12, paint);
            }
        }
        canvas.drawOval(17, 29, 83, 84, paint);
        paint.setColor(grey ? 0xFFAF99A0 : 0xFFEACAC6);
        canvas.drawPath(inner, paint);
        paint.setColor(grey ? 0xFFE7C17A : 0xFF91B2AF);
        canvas.drawCircle(35, 52, 6, paint); canvas.drawCircle(65, 52, 6, paint);
        paint.setColor(0xFF354339); canvas.drawOval(33, 48, 37, 56, paint); canvas.drawOval(63, 48, 67, 56, paint);
        paint.setColor(0xFFB98D91);
        canvas.drawPath(nose, paint);
        paint.setColor(0xFF68736C); paint.setStrokeWidth(1.4f);
        canvas.drawLine(50, 67, 50, 71, paint);
        canvas.drawLine(23, 63, 39, 66, paint); canvas.drawLine(23, 70, 39, 69, paint);
        canvas.drawLine(61, 66, 77, 63, paint); canvas.drawLine(61, 69, 77, 70, paint);
        canvas.restore();
    }
}
