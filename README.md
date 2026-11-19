# Мутирај / Mutiraj

[Ћирилица](#cirilica) · [Latinica](#latinica)

<a id="cirilica"></a>

<!-- cir:start -->

Екстензија за Brave, Vivaldi и друге Chromium прегледаче. Мутира YouTube видео док је изабрана особа на екрану и враћа звук чим се особа помери са екрана. Особу препознаје по лицу из фолдера `images/person/`. Све ради локално на рачунару.

## Инсталација

1. Клонирајте или ископирајте овај фолдер на компјутер, отпакујте (unzip) и сачувајте садржај у неки фолдер коме се локација неће мењати, `Downloads` или `Documents` фолдери.
2. Ставите неколико јасних слика особе у `images/person/` (JPG, PNG или WebP). Најбоље раде 3 до 10 слика, из различитих углова.

> Особа у фолдеру је дата као пример, али можете и задржати избор

3. Отворите `brave://extensions` (или `vivaldi://extensions` или `chrome://extensions` у зависности који прегледач користите), укључите **Developer mode**, кликните **Load unpacked** и изаберите фолдер који сте малопре отпаковали.
4. Кликните на иконицу екстензије. Треба да пише **Пратим 1 особу.**

Уколико додајете или замењујете слике, поново кликните на дугме **Освежи** како бисте учитали нове слике.

За више особа направите по један фолдер за сваку унутар `images/`.

## Коришћење

### Опција: Мутирај особу

Пустите било који YouTube видео. Док је особа на екрану звук је искључен, а видео иде даље. Звук се враћа сам, за око пола секунде уколико се особа изгуби из кадра. Мутира се само та картица, не цео рачунар.

### Опција: Мутирај текст

Ова опција мутира видео док је одређени текст исписан на екрану, на пример име испод говорника. Ради заједно са препознавањем лица: довољно је да се појави лице или текст.

1. Кликните на иконицу екстензије и укључи прекидач **Мутирај текст**.
2. Упишите имена у поље, једно име по реду, ћирилицом или латиницом (`Александар Нешто`, `John Smith`).
3. Пустите видео. Звук се искључује за мање од пола секунде након што се текст појави, а враћа се око секунд након што нестане.

Уместо куцања можете такође да ставиш слику текста, на пример исечак екрана са натписом, у фолдер `images/text/` и кликнете **Освежи**.

- Свеједно је којим писмом куцаш: `Александар Нешто` хвата и `Aleksandar Nešto` на екрану, и обрнуто.
- Велика и мала слова и знаци интерпункције нису битни.
- Чита се само текст у слици видеа, не наслов, опис или коментари.
- Препознају се бела слова исписана преко слике видеа. Тамна или обојена слова се не читају.

Ради само док је YouTube картица видљива.
<!-- cir:end -->

---

<a id="latinica"></a>

<!-- Овај део прави `pnpm readme` из ћириличног текста изнад. Не мењајте га ручно. -->
<!-- lat:start -->

# Mutiraj

Ekstenzija za Brave, Vivaldi i druge Chromium pregledače. Mutira YouTube video dok je izabrana osoba na ekranu i vraća zvuk čim se osoba pomeri sa ekrana. Osobu prepoznaje po licu iz foldera `images/person/`. Sve radi lokalno na računaru.

## Instalacija

1. Klonirajte ili iskopirajte ovaj folder na kompjuter, otpakujte (unzip) i sačuvajte sadržaj u neki folder kome se lokacija neće menjati, `Downloads` ili `Documents` folderi.
2. Stavite nekoliko jasnih slika osobe u `images/person/` (JPG, PNG ili WebP). Najbolje rade 3 do 10 slika, iz različitih uglova.

> Osoba u folderu je data kao primer, ali možete i zadržati izbor

3. Otvorite `brave://extensions` (ili `vivaldi://extensions` ili `chrome://extensions` u zavisnosti koji pregledač koristite), uključite **Developer mode**, kliknite **Load unpacked** i izaberite folder koji ste malopre otpakovali.
4. Kliknite na ikonicu ekstenzije. Treba da piše **Pratim 1 osobu.**

Ukoliko dodajete ili zamenjujete slike, ponovo kliknite na dugme **Osveži** kako biste učitali nove slike.

Za više osoba napravite po jedan folder za svaku unutar `images/`.

## Korišćenje

### Opcija: Mutiraj osobu

Pustite bilo koji YouTube video. Dok je osoba na ekranu zvuk je isključen, a video ide dalje. Zvuk se vraća sam, za oko pola sekunde ukoliko se osoba izgubi iz kadra. Mutira se samo ta kartica, ne ceo računar.

### Opcija: Mutiraj tekst

Ova opcija mutira video dok je određeni tekst ispisan na ekranu, na primer ime ispod govornika. Radi zajedno sa prepoznavanjem lica: dovoljno je da se pojavi lice ili tekst.

1. Kliknite na ikonicu ekstenzije i uključi prekidač **Mutiraj tekst**.
2. Upišite imena u polje, jedno ime po redu, ćirilicom ili latinicom (`Александар Нешто`, `John Smith`).
3. Pustite video. Zvuk se isključuje za manje od pola sekunde nakon što se tekst pojavi, a vraća se oko sekund nakon što nestane.

Umesto kucanja možete takođe da staviš sliku teksta, na primer isečak ekrana sa natpisom, u folder `images/text/` i kliknete **Osveži**.

- Svejedno je kojim pismom kucaš: `Александар Нешто` hvata i `Aleksandar Nešto` na ekranu, i obrnuto.
- Velika i mala slova i znaci interpunkcije nisu bitni.
- Čita se samo tekst u slici videa, ne naslov, opis ili komentari.
- Prepoznaju se bela slova ispisana preko slike videa. Tamna ili obojena slova se ne čitaju.

Radi samo dok je YouTube kartica vidljiva.
<!-- lat:end -->

[↑ Ћирилица](#cirilica)
