import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Steal implements IAbility {
  private static instance: Steal;

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
    this.name = "Steal";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active; // Assuming it's an active skill based on the usage of stealing
    this.helpFile = `
STEAL
Syntax: STEAL coins <character>
Syntax: STEAL <object> <character>

Theft is the defining skill of the thief, and is only available to that class.
It allows items to be stolen from the inventory of monsters and characters,
and remain undetected!  But beware, most monsters guard their belongings 
carefully, and attempting to steal from a character earns you a WANTED flag
if you are caught (making you free game for killing).
`;

    if (Steal.instance === undefined) {
      Steal.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Steal {
    if (!Steal.instance) {
      Steal.instance = new Steal();
    }
    return Steal.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Steal.GetInstance() as T;
  }
}

export default Steal;
