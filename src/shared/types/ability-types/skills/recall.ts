import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Recall implements IAbility {
  private static instance: Recall;

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
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `help recall
RECALL /
RECALL /
Syntax: RECALL
RECALL prays to the Gods for miraculous transportation from where you are
back to the Temple of your home kingdom.  '/' is a synonym for RECALL.
If you RECALL during combat, you will lose experience (more than for fleeing),
and you will have a chance of failing (again, more than for fleeing).  This
chance is based on your recall skill, although a 100% recall does not 
insure success.
RECALL costs half of your movement points.
RECALL doesn't work in certain god-forsaken rooms.  Characters afflicted by a
curse may not recall at all.`;
    if (Recall.instance === undefined) {
      Recall.instance = this;
    }
  }
  // Method to get the single instance of the class
  public static GetInstance(): Recall {
    if (!Recall.instance) {
      Recall.instance = new Recall();
    }
    return Recall.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Recall.GetInstance() as T;
  }
}

export default Recall;
