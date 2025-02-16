import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Martyr implements IAbility {
  private static instance: Martyr;

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
    this.name = "Martyr";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `MARTYR
 
Syntax: Martyr <target>
 
Ever fighting for the noble cause, the Crusader can cast themselves as the 
martyr against an enemy in order to sacrifice themselves to save another. In 
doing so, this does leave the Crusader open for the opponent to slay them.

Groups containing this skill: CRUSADER DEFAULT`;

    if (Martyr.instance === undefined) {
      Martyr.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Martyr {
    if (!Martyr.instance) {
      Martyr.instance = new Martyr();
    }
    return Martyr.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Martyr.GetInstance() as T;
  }
}

export default Martyr;
