import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Cancellation implements IAbility {
  private static instance: Cancellation;

  name: string;
  helpFile: string;
  manualDescription?: string | undefined;
  duration?: number | undefined;
  effects?: SkillSpellEffects | undefined;
  group?: string | undefined;
  alternateKeyword?: string | undefined;
  recommendedHelpFileChanges?: string | undefined;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Cancellation";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `help Cancellation
'DISPEL MAGIC' CANCELLATION
'DISPEL MAGIC' CANCELLATION
Syntax: cast 'dispel magic' <character>
        cast 'cancellation' <character>
Both of these spells remove magical effects from the target.  Dispel magic
has a reduced chance of working, and is considering an attack spell.
Cancellation can only be used on allies, but is much more effective and does
not provoke attack.  Unfortunately, the spells do not discriminate between
harmful and benign spells.
The chance of dispelling is based on the level of the spell. Permanent spells
(such as mobile sanctuary) are much harder to remove.  Not all spells may
be dispelled, notable examples are poison and plague.`;
    if (Cancellation.instance === undefined) {
      Cancellation.instance = this;
    }
  }
  // Method to get the single instance of the class
  public static GetInstance(): Cancellation {
    if (!Cancellation.instance) {
      Cancellation.instance = new Cancellation();
    }
    return Cancellation.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Cancellation.GetInstance() as T;
  }
}

export default Cancellation;
