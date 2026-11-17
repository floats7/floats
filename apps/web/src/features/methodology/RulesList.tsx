import { Reveal } from "@/components/ui/Reveal";
import { RULES } from "@/data/methodology";
import styles from "./RulesList.module.css";

/** Light "paper" surface: the one inverted section, reserved for the rulebook. */
export function RulesList() {
  return (
    <section className={styles.paper} aria-labelledby="rules-title">
      <div className={`container ${styles.inner}`}>
        <Reveal>
          <h2 id="rules-title" className={styles.title}>
            The rulebook
          </h2>
        </Reveal>
        <ol className={styles.rules}>
          {RULES.map((rule, index) => (
            <li key={rule.title}>
              <Reveal className={styles.rule} delay={index * 0.04}>
                <span className={`${styles.number} tabular`}>{String(index + 1).padStart(2, "0")}</span>
                <h3 className={styles.ruleTitle}>{rule.title}</h3>
                <p className={styles.body}>{rule.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
