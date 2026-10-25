# Gemeinsamer KI-Zugang einrichten

Die App sendet KI-Anfragen über die Supabase-Edge-Function `anthropic-proxy`. Der Anthropic-Schlüssel liegt nur als Supabase-Secret und muss weder in die App noch ins GitHub-Repository eingetragen werden. Angemeldete Nutzer der App können dadurch denselben KI-Zugang verwenden.

## Einmalige Einrichtung

1. Öffne das Supabase-Projekt `rvaxhnemqxizwrulcbya`.
2. Gehe zu **Edge Functions** und erstelle eine Function namens `anthropic-proxy` (im Editor / Dashboard).
3. Ersetze den Beispielcode durch den Inhalt von [index.ts](functions/anthropic-proxy/index.ts) und deploye die Function.
4. Öffne **Edge Function Secrets** (bzw. **Project Settings → Edge Functions → Secrets**) und speichere dort:
   - Name: `ANTHROPIC_API_KEY`
   - Wert: dein privater Anthropic-Key
5. Lade die Berichtsheft-App neu und melde dich an. Der Schlüssel gehört nur in dieses Secret, niemals in den App-Code, GitHub oder einen Chat.

Die Function verlangt ein gültiges Supabase-Login, verwendet ein festes Anthropic-Modell, begrenzt die maximale Antwortlänge und akzeptiert höchstens 30 Anfragen pro Minute und Nutzer innerhalb derselben Function-Instanz. Die In-Memory-Begrenzung ist ein Schutz gegen versehentliche Schleifen, kein dauerhaftes Tageslimit.
