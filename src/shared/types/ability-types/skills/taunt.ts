import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Taunt implements IAbility {
  private static instance: Taunt;

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
    this.helpFile = `
TAUNT
Syntax: taunt <target>
This is a kender only skill that allows kender to force opponents into 
rages by throwing a string of insults at them. The opponents hitroll 
suffers greatly, but their dam roll increases (the madder you are, the 
harder you hit).`;

    this.manualDescription = "";
  }

  // Method to get the single instance of the class
  public static GetInstance(): Taunt {
    if (!Taunt.instance) {
      Taunt.instance = new Taunt();
    }
    return Taunt.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Taunt.GetInstance() as T;
  }
}

export default Taunt;
