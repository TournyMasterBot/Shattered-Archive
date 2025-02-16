import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Fukiya implements IAbility {
  private static instance: Fukiya;

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
    this.name = "Fukiya";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `FUKIYA

Syntax: Fukiya <direction> <target>

Using a small blowgun, the Ninja may fire a dart into another room (but not
the same room), rendering targets unconscious if the dart hits.  

SEE ALSO: NINJA`;

    if (Fukiya.instance === undefined) {
      Fukiya.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Fukiya {
    if (!Fukiya.instance) {
      Fukiya.instance = new Fukiya();
    }
    return Fukiya.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Fukiya.GetInstance() as T;
  }
}

export default Fukiya;
