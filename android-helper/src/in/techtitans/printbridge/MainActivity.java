package in.techtitans.printbridge;

import android.app.*;
import android.os.Bundle;
import android.content.*;
import android.net.Uri;
import android.view.View;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;

/** Network-only helper. Does not embed a browser or accept URLs/documents from intents. */
public final class MainActivity extends Activity {
    private static final String SITE="https://theeskapooo.onrender.com";
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final String[] keys={"kyocera-new","kyocera-old","canon"};
    private final String[] names={"KYOCERA MZ3200i — large jobs","KYOCERA 3212i — small jobs","Canon G3770 — colour"};
    private EditText[] fields=new EditText[3]; private TextView status; private boolean busy=false;
    private SharedPreferences prefs;
    @Override public void onCreate(Bundle state){super.onCreate(state);prefs=getSharedPreferences("printers",MODE_PRIVATE);screen();if(state==null)handle(getIntent());else message("The helper restarted. Check the printer before repeating an interrupted job.");}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);handle(intent);}
    private void screen(){
        ScrollView scroll=new ScrollView(this);LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(24,48,24,40);scroll.addView(box);setContentView(scroll);
        TextView title=new TextView(this);title.setText("THEESKAPOOO Print\nTech Titans · supervised test");title.setTextSize(26);box.addView(title);
        TextView note=new TextView(this);note.setText("Connect to the shop Wi-Fi. Save each printer's IPP address, then test the connection. No print is sent by Test. This version supports printers advertising direct PDF over IPP.");note.setTextSize(17);box.addView(note);
        for(int i=0;i<3;i++){final int index=i;TextView label=new TextView(this);label.setText(names[i]);label.setTextSize(19);label.setPadding(0,24,0,4);box.addView(label);fields[i]=new EditText(this);fields[i].setSingleLine(true);fields[i].setTextSize(16);fields[i].setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_URI);fields[i].setHint("ipp://printer-ip:631/ipp/print");fields[i].setText(prefs.getString(keys[i],""));box.addView(fields[i]);Button test=new Button(this);test.setText("Save & test connection");test.setOnClickListener(v->test(index));box.addView(test);}
        Button site=new Button(this);site.setText("Open shop dashboard");site.setOnClickListener(v->startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(SITE+"/operator.html"))));box.addView(site);
        status=new TextView(this);status.setTextSize(18);status.setPadding(0,22,0,12);status.setText("Ready for setup. Printing never marks an order ready to collect automatically.");box.addView(status);
    }
    private void message(String value){runOnUiThread(()->{if(!isFinishing()&&!isDestroyed())status.setText(value);});}
    private void test(int index){
        if(busy){message("A print is in progress. Wait before changing printer setup.");return;}
        final String raw=fields[index].getText().toString();final URI uri;try{uri=Ipp.endpoint(raw);}catch(Exception e){message(e.getMessage());return;}
        prefs.edit().putString(keys[index],uri.toString()).apply();busy=true;message("Checking printer capabilities. No document will be sent…");
        worker.execute(()->{try{Ipp.Reply r=Ipp.request(uri,11,Collections.emptyList(),null,0);String result=r.status==0&&r.has("document-format-supported","application/pdf")?"Connected. Direct PDF is advertised. Settings are checked before every print.":"Direct PDF is not confirmed. Use the vendor app until integration is verified.";message(result+"\nModel: "+r.summary("printer-make-and-model")+"\nFormats: "+r.summary("document-format-supported")+"\nSides: "+r.summary("sides-supported"));}catch(Exception e){message("Connection test failed. Check Wi-Fi and the exact IPP address. "+e.getMessage());}finally{runOnUiThread(()->busy=false);}});
    }
    private JSONObject payload(String id,int index)throws JSONException{return new JSONObject().put("id",id).put("index",index);}
    private byte[] cloud(String route,String token,JSONObject body,int maximum)throws IOException{
        HttpURLConnection c=(HttpURLConnection)new URL(SITE+"/api/mobile-print/"+route).openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(120000);c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("Authorization","Bearer "+token);byte[] bytes=body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);c.setFixedLengthStreamingMode(bytes.length);
        try{try(OutputStream out=c.getOutputStream()){out.write(bytes);}if(c.getResponseCode()!=200){String error="Print server rejected the request ("+c.getResponseCode()+").";try{error=new JSONObject(new String(Ipp.read(c.getErrorStream(),16384),java.nio.charset.StandardCharsets.UTF_8)).optString("error",error);}catch(Exception ignored){}throw new IOException(error);}return Ipp.read(c.getInputStream(),maximum);}finally{c.disconnect();}
    }
    private void handle(Intent intent){
        Uri uri=intent.getData();if(uri==null)return;
        if(busy){message("Another job is in progress. Check it before starting a new job.");return;}
        if(!"theeskapooo".equals(uri.getScheme())||!"print".equals(uri.getHost())){message("Invalid print link.");return;}
        final String id=uri.getQueryParameter("id"),token=intent.getStringExtra("ticket");final int index;
        try{index=Integer.parseInt(uri.getQueryParameter("index"));}catch(Exception e){message("Invalid print reference.");return;}
        if(id==null||!id.matches("[a-f0-9-]{36}")||index<0||index>9||token==null||!token.matches("[a-f0-9]{64}")){message("Invalid or missing print ticket. Open the shop dashboard and choose Print.");return;}
        final String key="sent:"+id+":"+index;
        if(prefs.contains(key)){message("This file already reached submission. Check the printer/queue; automatic duplicate printing is blocked.");return;}
        busy=true;message("Checking your print request and the selected printer…");
        worker.execute(()->{
            boolean claimed=false,submitted=false;int jobId=-1;byte[] pdf=null;
            try{
                JSONObject body=payload(id,index),manifest=new JSONObject(new String(cloud("manifest",token,body,16384),java.nio.charset.StandardCharsets.UTF_8));
                String printer=manifest.getString("printer");if(!Arrays.asList(keys).contains(printer))throw new IOException("Unknown printer profile.");
                String configured=prefs.getString(printer,"");if(configured.isEmpty())throw new IOException("Set up the selected printer on this phone first. Then reopen the print request.");
                URI endpoint=Ipp.endpoint(configured);JSONObject settings=manifest.getJSONObject("settings");
                List<Ipp.Attribute> attrs=Ipp.settings(settings.getString("sides"),settings.getString("duplexEdge"),settings.getString("orientation"),settings.getString("colour"));
                Ipp.validate(endpoint,attrs);
                message("Settings accepted by the printer. Preparing your document…");
                // Claim before fetching. If a timeout occurs, the server blocks a second redemption.
                claimed=true;pdf=cloud("redeem",token,body,50*1024*1024);
                if(pdf.length<5||pdf[0]!='%'||pdf[1]!='P'||pdf[2]!='D'||pdf[3]!='F')throw new IOException("Invalid prepared document.");
                if(!prefs.edit().putString(key,"submission-started").commit())throw new IOException("Could not save duplicate-print protection.");
                message("Sending to "+printer+". Do not tap Print again…");
                Ipp.Reply result=Ipp.request(endpoint,2,attrs,pdf,0);jobId=result.number("job-id");
                if(result.status!=0||jobId<1)throw new IOException("Printer did not confirm exact acceptance; check its queue before retrying.");
                submitted=true;prefs.edit().putString(key,"job:"+jobId).apply();
                message("Printer accepted job "+jobId+" with the requested settings. Checking printer status…");
                try{Ipp.Reply state=Ipp.request(endpoint,9,Collections.emptyList(),null,jobId);int n=state.number("job-state");message(n==9?"Printer reports job "+jobId+" completed. Check paper output, then mark ready in THEESKAPOOO.":n==7||n==8?"Printer reports job stopped/cancelled. Check paper output and its queue before a manual reprint.":"Printer accepted job "+jobId+". It may still be queued/printing. Check paper output before marking ready.");}catch(Exception e){message("Job "+jobId+" was accepted, but status could not be checked. Do not resend; inspect the printer.");}
            }catch(Exception e){message((claimed?"Check the printer/queue before retrying. ":"No document was sent. ")+e.getMessage());}
            finally{
                if(pdf!=null)Arrays.fill(pdf,(byte)0);
                if(claimed)try{cloud("result",token,payload(id,index).put("state",submitted?"submitted":"uncertain").put("jobId",jobId),16384);}catch(Exception ignored){}
                runOnUiThread(()->busy=false);
            }
        });
    }
    @Override public void onDestroy(){super.onDestroy();worker.shutdown();}
}
