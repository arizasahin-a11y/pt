' Scriptin kendi bulundugu klasoru BASE olarak kullan
Dim BASE
BASE = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))

Dim xl : Set xl = CreateObject("Excel.Application")
xl.Visible = False
xl.DisplayAlerts = False

Function OpenWb(path)
    On Error Resume Next
    Set OpenWb = xl.Workbooks.Open(path)
    If Err.Number <> 0 Then
        MsgBox "Dosya acilamadi: " & path & vbCrLf & "Hata: " & Err.Description, 16, "Hata"
        xl.Quit
        WScript.Quit
    End If
    On Error GoTo 0
End Function

' --- Dosyalari ac ---
Dim wbOR  : Set wbOR  = OpenWb(BASE & "ogp proiz rapor.xlsx")
Dim wbOGT : Set wbOGT = OpenWb(BASE & "OGP FAAL" & ChrW(304) & "YET TAKV" & ChrW(304) & "M" & ChrW(304) & ".xlsx")
Dim wbOGE : Set wbOGE = OpenWb(BASE & "OGP OKUL EYLEM PLANI.xlsx")
Dim wbOOT : Set wbOOT = OpenWb(BASE & "O" & ChrW(214) & "P FAAL" & ChrW(304) & "YET TAKV" & ChrW(304) & "M" & ChrW(304) & ".xlsx")
Dim wbOOE : Set wbOOE = OpenWb(BASE & "O" & ChrW(214) & "P OKUL EYLEM PLANI.xlsx")

Dim outFile : outFile = BASE & "o" & ChrW(246) & "p proiz rapor.xlsx"
wbOR.SaveCopyAs outFile
Dim wbOut : Set wbOut = OpenWb(outFile)

Dim v1, v2, s1, s2, fc, fa, ws, wsG, wsO, nr, nc, ri, ci, rpi, si
Dim count : count = 0

' --- Veri Degistirme Fonksiyonu ---
Sub ProcessSource(wbSourceOld, wbSourceNew)
    Dim si, ri, ci, rpi, v1, v2, s1, s2, wsG, wsO, wsR, fc, fa
    For si = 1 To wbSourceOld.Sheets.Count
        If si > wbSourceNew.Sheets.Count Then Exit For
        Set wsG = wbSourceOld.Sheets(si)
        Set wsO = wbSourceNew.Sheets(si)
        
        nr = wsG.UsedRange.Rows.Count
        nc = wsG.UsedRange.Columns.Count
        
        For ri = 1 To nr
            For ci = 1 To nc
                v1 = wsG.Cells(ri, ci).Value
                v2 = wsO.Cells(ri, ci).Value
                
                If Not IsEmpty(v1) And Not IsNull(v1) Then
                    s1 = Trim(CStr(v1))
                    s2 = Trim(CStr(v2))
                    
                    If s1 <> "" And s1 <> s2 Then
                        ' Rapordaki tum sayfalarda ara
                        For rpi = 1 To wbOut.Sheets.Count
                            Set wsR = wbOut.Sheets(rpi)
                            On Error Resume Next
                            ' Parametreler: (Neyi, Sonraki, Neyde bak, Tam/Parca)
                            ' -4163 = xlValues, 1 = xlWhole
                            Set fc = wsR.Cells.Find(s1, , -4163, 1)
                            On Error GoTo 0
                            
                            If Not fc Is Nothing Then
                                fa = fc.Address
                                Do
                                    fc.Value = v2
                                    count = count + 1
                                    On Error Resume Next
                                    Set fc = wsR.Cells.FindNext(fc)
                                    On Error GoTo 0
                                    If fc Is Nothing Then Exit Do
                                    If fc.Address = fa Then Exit Do
                                Loop
                            End If
                        Next
                    End If
                End If
            Next
        Next
    Next
End Sub

' --- Islemleri Baslat ---
ProcessSource wbOGT, wbOOT ' Takvimi isle
ProcessSource wbOGE, wbOOE ' Eylemi isle

wbOut.Save
wbOut.Close
wbOR.Close False
wbOGT.Close False
wbOGE.Close False
wbOOT.Close False
wbOOE.Close False
xl.Quit

If count > 0 Then
    MsgBox "ISLEM TAMAMLANDI!" & vbCrLf & _
           "Toplam " & count & " adet hucre degistirildi." & vbCrLf & _
           "Dosya: " & outFile, 64, "Basarili"
Else
    MsgBox "Islem bitti ancak hicbir hucre degistirilemedi." & vbCrLf & _
           "Eslesen veri bulunamamış olabilir.", 48, "Uyari"
End If
