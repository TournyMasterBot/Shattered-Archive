import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Disguise implements IAbility {
  private static instance: Disguise;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
DISGUISE

Syntax: Disguise <mobname>

The Ninja, being a master of stealth and fading into any environment, may
disguise itself, taking the form of a humanoid creature (MOB) of which they
are in the same area as. Any damage or attack will break this disguise,
though the Ninja is able to speak (but not use channels) while disguised.  

SEE ALSO: NINJA
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.manualDescription = "";

    if (Disguise.instance === undefined) {
      Disguise.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Disguise {
    if (!Disguise.instance) {
      Disguise.instance = new Disguise();
    }
    return Disguise.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Disguise.GetInstance() as T;
  }
}

export default Disguise;
