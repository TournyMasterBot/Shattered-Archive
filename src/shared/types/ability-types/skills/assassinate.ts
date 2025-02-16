import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Assassinate implements IAbility {
  private static instance: Assassinate;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Assassinate";
    this.helpFile = `ASSASSINATE
Syntax:  assassinate <name>
This skill can be used by assassins to initiate combat. For the attempt
to be successful, the assassin must be hiding when the attack is made.  
This type of attack may only be made on reasonably healthy targets and 
does damage similar to the thieves backstab skill but with a small chance
of killing the victim with a single blow. There is a stiff time delay 
penalty if the attempt is unsuccessful.`;

    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;

    if (Assassinate.instance === undefined) {
      Assassinate.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Assassinate {
    if (!Assassinate.instance) {
      Assassinate.instance = new Assassinate();
    }
    return Assassinate.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Assassinate.GetInstance() as T;
  }
}

export default Assassinate;
