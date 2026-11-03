// Stand-in for claude.exe in CI (never a real model call). Records the arguments it received, exactly as Windows
// parsed the command line, so the test can compare them with what the course command meant to pass.
using System;
using System.IO;
using System.Text;

class FakeClaude
{
    static int Main(string[] args)
    {
        string log = Environment.GetEnvironmentVariable("FAKE_CLAUDE_LOG");
        if (!string.IsNullOrEmpty(log))
        {
            File.WriteAllText(log, string.Join("\n<<<ARG>>>\n", args), new UTF8Encoding(false));
        }
        Console.WriteLine("fake claude: " + args.Length + " arguments");
        Console.Error.WriteLine("fake claude: a line on stderr (real claude can write here too)");
        string code = Environment.GetEnvironmentVariable("FAKE_CLAUDE_EXIT");
        return string.IsNullOrEmpty(code) ? 0 : int.Parse(code);
    }
}
