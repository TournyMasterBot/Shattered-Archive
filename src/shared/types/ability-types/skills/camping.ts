import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Camping implements IAbility {
  private static instance: Camping;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Camping";
    this.helpFile = `
help camping
CAMP CAMPING
Syntax:  camp
Camping allows a ranger to make a comfortable place for themselves when in an
appropriate place for camping.  Everyone in a ranger camp benefits from the
comfortable setting and both mental and physical healing seem to occur at 
faster than normal rates.
The camp skill is available only to rangers.  When used, it forces the ranger
into a resting position, and the campsite loses its effectiveness when the
ranger breaks camp by standing up.
See also:  RANGER
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.manualDescription = "";

    if (Camping.instance === undefined) {
      Camping.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Camping {
    if (!Camping.instance) {
      Camping.instance = new Camping();
    }
    return Camping.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Camping.GetInstance() as T;
  }
}

export default Camping;
