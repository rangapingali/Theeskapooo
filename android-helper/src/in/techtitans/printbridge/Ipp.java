package in.techtitans.printbridge;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Minimal strict IPP/1.1 client. No discovery scans, redirects or print retries. */
public final class Ipp {
    public static final class Attribute {
        final int tag; final String name; final byte[] value;
        Attribute(int tag,String name,byte[] value){this.tag=tag;this.name=name;this.value=value;}
    }
    public static Attribute text(int tag,String name,String value){return new Attribute(tag,name,value.getBytes(StandardCharsets.UTF_8));}
    public static Attribute integer(int tag,String name,int value){return new Attribute(tag,name,new byte[]{(byte)(value>>24),(byte)(value>>16),(byte)(value>>8),(byte)value});}
    public static final class Reply {
        public int status; public final Map<String,List<byte[]>> values=new HashMap<>();
        public boolean has(String name,String expected){for(byte[] b:values.getOrDefault(name,Collections.emptyList()))if(new String(b,StandardCharsets.UTF_8).equals(expected))return true;return false;}
        public String summary(String name){StringBuilder result=new StringBuilder();for(byte[] b:values.getOrDefault(name,Collections.emptyList())){if(result.length()>1000)break;if(result.length()>0)result.append(", ");result.append(new String(b,StandardCharsets.UTF_8));}return result.length()==0?"not advertised":result.toString();}
        public int number(String name){List<byte[]> v=values.get(name);if(v==null||v.isEmpty()||v.get(0).length!=4)return -1;byte[] b=v.get(0);return ((b[0]&255)<<24)|((b[1]&255)<<16)|((b[2]&255)<<8)|(b[3]&255);}
    }
    public static URI endpoint(String raw) throws IOException {
        try {
            URI u=new URI(raw.trim());String host=u.getHost();
            if(!Arrays.asList("ipp","ipps").contains(u.getScheme())||u.getUserInfo()!=null||u.getQuery()!=null||u.getFragment()!=null||host==null||!host.matches("[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+"))throw new Exception();
            String[] pieces=host.split("\\.");int[] ip=new int[4];for(int i=0;i<4;i++){ip[i]=Integer.parseInt(pieces[i]);if(ip[i]>255||!pieces[i].equals(String.valueOf(ip[i])))throw new Exception();}
            if(!(ip[0]==10||(ip[0]==192&&ip[1]==168)||(ip[0]==172&&ip[1]>=16&&ip[1]<=31))||ip[3]==0||ip[3]==255)throw new Exception();
            if(u.getPort()!=-1&&u.getPort()!=631&&u.getPort()!=443)throw new Exception();
            if(u.getPath()==null||!u.getPath().startsWith("/")||u.getPath().length()>120)throw new Exception();return u;
        } catch(Exception e){throw new IOException("Use a private printer address such as ipp://192.168.1.15:631/ipp/print (port 631 or 443 only).");}
    }
    static void attribute(DataOutputStream out,Attribute a)throws IOException{byte[] n=a.name.getBytes(StandardCharsets.UTF_8);out.writeByte(a.tag);out.writeShort(n.length);out.write(n);out.writeShort(a.value.length);out.write(a.value);}
    public static byte[] encode(int operation,int requestId,String uri,List<Attribute> job,int jobId)throws IOException{
        ByteArrayOutputStream buffer=new ByteArrayOutputStream();DataOutputStream out=new DataOutputStream(buffer);
        out.writeShort(0x0101);out.writeShort(operation);out.writeInt(requestId);out.writeByte(1);
        attribute(out,text(0x47,"attributes-charset","utf-8"));attribute(out,text(0x48,"attributes-natural-language","en"));attribute(out,text(0x45,"printer-uri",uri));
        if(jobId>0)attribute(out,integer(0x21,"job-id",jobId));
        if(operation==2||operation==4){attribute(out,text(0x49,"document-format","application/pdf"));attribute(out,new Attribute(0x22,"ipp-attribute-fidelity",new byte[]{1}));attribute(out,text(0x42,"job-name","THEESKAPOOO print"));}
        if(!job.isEmpty()){out.writeByte(2);for(Attribute a:job)attribute(out,a);}out.writeByte(3);return buffer.toByteArray();
    }
    public static Reply decode(byte[] bytes,int requestId)throws IOException{
        DataInputStream in=new DataInputStream(new ByteArrayInputStream(bytes));int version=in.readUnsignedShort();if(version!=0x0101&&version!=0x0100&&version!=0x0200)throw new IOException("Invalid IPP response.");
        Reply r=new Reply();r.status=in.readUnsignedShort();if(in.readInt()!=requestId)throw new IOException("Printer response ID mismatch.");String last="";boolean end=false;
        while(in.available()>0){int tag=in.readUnsignedByte();if(tag==3){end=true;break;}if(tag<0x10){last="";continue;}int n=in.readUnsignedShort();if(n>4096)throw new IOException("Invalid printer attribute.");byte[] name=new byte[n];in.readFully(name);if(n>0)last=new String(name,StandardCharsets.UTF_8);int len=in.readUnsignedShort();byte[] value=new byte[len];in.readFully(value);if(last.isEmpty())throw new IOException("Invalid printer attribute name.");r.values.computeIfAbsent(last,k->new ArrayList<>()).add(value);}
        if(!end)throw new IOException("Incomplete printer response.");return r;
    }
    public static Reply request(URI uri,int operation,List<Attribute> attributes,byte[] pdf,int jobId)throws IOException{
        int requestId=new java.security.SecureRandom().nextInt(Integer.MAX_VALUE-1)+1;
        byte[] prefix=encode(operation,requestId,uri.toString(),attributes,jobId);
        URL url=new URL(uri.getScheme().equals("ipps")?"https":"http",uri.getHost(),uri.getPort()==-1?631:uri.getPort(),uri.getRawPath());
        HttpURLConnection connection=(HttpURLConnection)url.openConnection();connection.setConnectTimeout(10000);connection.setReadTimeout(operation==2?120000:15000);connection.setInstanceFollowRedirects(false);connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/ipp");connection.setFixedLengthStreamingMode(prefix.length+(pdf==null?0:pdf.length));
        try{try(OutputStream out=connection.getOutputStream()){out.write(prefix);if(pdf!=null)out.write(pdf);}if(connection.getResponseCode()!=200)throw new IOException("Printer HTTP "+connection.getResponseCode()+". Check the IPP endpoint and printer access settings.");byte[] bytes=read(connection.getInputStream(),1024*1024);return decode(bytes,requestId);}finally{connection.disconnect();}
    }
    public static byte[] read(InputStream in,int limit)throws IOException{try(InputStream stream=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n,total=0;while((n=stream.read(b))!=-1){total+=n;if(total>limit)throw new IOException("Response exceeds safe size limit.");out.write(b,0,n);}return out.toByteArray();}}
    public static List<Attribute> settings(String sides,String edge,String orientation,String colour){
        boolean longEdge=edge.equals("left-right")==!orientation.equals("landscape");
        return Arrays.asList(text(0x44,"media","iso_a4_210x297mm"),integer(0x21,"copies",1),integer(0x21,"number-up",1),integer(0x23,"orientation-requested",orientation.equals("landscape")?4:3),text(0x44,"sides",sides.equals("double")?(longEdge?"two-sided-long-edge":"two-sided-short-edge"):"one-sided"),text(0x44,"print-color-mode",colour.equals("colour")?"color":"monochrome"),integer(0x23,"print-quality",5));
    }
    public static void validate(URI uri,List<Attribute> attrs)throws IOException{
        Reply caps=request(uri,11,Collections.emptyList(),null,0);if(caps.status!=0)throw new IOException("Printer capability check failed: "+caps.status);
        if(!caps.has("document-format-supported","application/pdf"))throw new IOException("This printer does not advertise direct PDF printing. Use the vendor app; no document was sent.");
        Reply result=request(uri,4,attrs,null,0);if(result.status!=0)throw new IOException("Printer cannot honour every setting (IPP "+result.status+"). No document was sent.");
    }
}
