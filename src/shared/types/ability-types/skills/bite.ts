import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Bite implements IAbility {
  private static instance: Bite;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Bite";
    this.helpFile = `
BITE
Syntax:  bite <target>
         bite
An attack skill used by dragons to bite a foe using their sharp teeth and
powerful jaws.
A dragon may bite a foe to initiate combat, or use bite without a target if
already engaged with a foe.
See Also:  DRAGONS
        `;

    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;

    if (Bite.instance === undefined) {
      Bite.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Bite {
    if (!Bite.instance) {
      Bite.instance = new Bite();
    }
    return Bite.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Bite.GetInstance() as T;
  }
}

export default Bite;
