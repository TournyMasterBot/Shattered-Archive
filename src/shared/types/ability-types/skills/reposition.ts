import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Reposition implements IAbility {
  private static instance: Reposition;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Reposition";
    this.helpFile = `
reposition
The art of repositioning in combat is one which requires much grace in
movement. This skill thus has been perfected as a combat technique of the
bladesong. When an aggressive move is made towards the bladesinger, an
attempt to reposition themselves and slash back rather hard is made. It has
been rumored that one can't reposition themselves if they are not dancing
the bladesong.    
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;

    if (Reposition.instance === undefined) {
      Reposition.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Reposition {
    if (!Reposition.instance) {
      Reposition.instance = new Reposition();
    }
    return Reposition.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Reposition.GetInstance() as T;
  }
}

export default Reposition;
