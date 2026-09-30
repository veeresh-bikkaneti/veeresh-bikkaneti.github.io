#!/usr/bin/env python3
from pathlib import Path

p = Path("index.html")
text = p.read_text()
if '<section id="about"' in text:
    proj = text.find('id="projects"')
    abt = text.find('<section id="about"')
    if proj != -1 and abt != -1:
        seg = text[proj:abt]
        if seg.count("<li>") == seg.count("</li>") and "<!-- About:" not in seg:
            print("already structured")
            raise SystemExit(0)

start = text.find('<h3><a href="https://github.com/veeresh-bikkaneti/cucumberBDDParallel">cucumberBDDParallel</a></h3>')
if start < 0:
    raise SystemExit("cucumber card missing")
li = text.rfind("<li>", 0, start)
about = text.find('<section id="about"', start)
if about < 0:
    raise SystemExit("about missing")
sec_end = text.find("</section>", about)
if sec_end < 0:
    raise SystemExit("about close missing")
sec_end += len("</section>")
main = text.find("  </main>", sec_end)
if main < 0:
    raise SystemExit("main missing")

cards = """<li>
            <article class="card">
              <h3><a href="https://github.com/veeresh-bikkaneti/cucumberBDDParallel">cucumberBDDParallel</a></h3>
              <p class="desc">Cucumber-JVM BDD framework running features in parallel with TestNG and Cluecumber reports.</p>
              <div class="meta"><span class="lang" style="--dot:#b07219">Java</span><span class="tag">★ 2</span></div>
            </article>
          </li>
          <li>
            <article class="card" data-repo="SeleniumTestNGParallelExtentReports">
              <h3><a href="https://github.com/veeresh-bikkaneti/SeleniumTestNGParallelExtentReports">SeleniumTestNGParallelExtentReports</a></h3>
              <p class="desc">Parallel Selenium execution with TestNG and Extent Reports for readable test results.</p>
              <div class="meta"><span class="lang" style="--dot:#b07219">Java</span></div>
            </article>
          </li>
          <li>
            <article class="card" data-repo="SpecFlowDataTable">
              <h3><a href="https://github.com/veeresh-bikkaneti/SpecFlowDataTable">SpecFlowDataTable</a></h3>
              <p class="desc">Working with Gherkin data tables in SpecFlow step definitions (C# / .NET BDD).</p>
              <div class="meta"><span class="lang" style="--dot:#178600">C#</span></div>
            </article>
          </li>
        </ul>
      </div>
    </section>

"""
new = text[:li] + cards + text[about:sec_end] + "\n" + text[main:]
proj = new.find('id="projects"')
abt = new.find('<section id="about"')
seg = new[proj:abt]
if seg.count("<li>") != seg.count("</li>"):
    raise SystemExit(f"li imbalance {seg.count('<li>')} vs {seg.count('</li>')}")
if "<!-- About:" in seg:
    raise SystemExit("about still inside projects")
p.write_text(new)
print("patched", p.stat().st_size)
