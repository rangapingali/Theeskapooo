import in.techtitans.printbridge.Ipp;
import java.io.*;
import java.net.*;
import java.util.*;
import com.sun.net.httpserver.HttpServer;
public class IppTest {
 static void check(boolean value){if(!value)throw new AssertionError();}
 static void reject(String raw)throws Exception{try{Ipp.endpoint(raw);throw new AssertionError(raw);}catch(IOException expected){}}
 public static void main(String[] args)throws Exception{
  check(Ipp.endpoint("ipp://192.168.1.15:631/ipp/print").getHost().equals("192.168.1.15"));
  for(String raw:Arrays.asList("http://192.168.1.15/ipp","ipp://127.0.0.1:631/ipp","ipp://8.8.8.8:631/ipp","ipp://user:password@192.168.1.15/ipp","ipp://printer.example/ipp","ipp://192.168.1.15:22/ipp","ipp://192.168.001.15:631/ipp"))reject(raw);
  byte[] encoded=Ipp.encode(4,123,"ipp://192.168.1.15:631/ipp/print",Ipp.settings("double","left-right","portrait","bw"),0);
  String raw=new String(encoded,java.nio.charset.StandardCharsets.ISO_8859_1);check(raw.contains("two-sided-long-edge"));check(raw.contains("iso_a4_210x297mm"));check(raw.contains("ipp-attribute-fidelity"));check(raw.contains("monochrome"));check(raw.contains("orientation-requested"));
  String landscape=new String(Ipp.encode(4,123,"ipp://192.168.1.15:631/ipp/print",Ipp.settings("double","left-right","landscape","colour"),0),java.nio.charset.StandardCharsets.ISO_8859_1);check(landscape.contains("two-sided-short-edge"));check(landscape.contains("color"));
  HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
  final int[] calls={0};server.createContext("/ipp/print",exchange->{byte[] request=Ipp.read(exchange.getRequestBody(),1024*1024);calls[0]++;check(request[3]==4);byte[] response=Arrays.copyOf(request,8);response[2]=0;response[3]=0;exchange.getResponseHeaders().set("Content-Type","application/ipp");exchange.sendResponseHeaders(200,9);exchange.getResponseBody().write(response);exchange.getResponseBody().write(3);exchange.close();});server.start();
  try{Ipp.Reply reply=Ipp.request(new URI("ipp://127.0.0.1:"+server.getAddress().getPort()+"/ipp/print"),4,Collections.emptyList(),null,0);check(reply.status==0);check(calls[0]==1);}finally{server.stop(0);}
  try{Ipp.decode(new byte[]{1,1,0,0,0,0,0,1,3},2);throw new AssertionError();}catch(IOException expected){}
  try{Ipp.decode(new byte[]{1,1,0,0,0,0,0,1},1);throw new AssertionError();}catch(IOException expected){}
  System.out.println("IPP tests passed: private endpoints, exact settings, duplex mapping, response validation, and single HTTP submission.");
 }
}
