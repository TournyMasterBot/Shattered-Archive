import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Dig implements IAbility {
  private static instance: Dig;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help dig
DIG BURY
Syntax: Dig
Syntax: Dig <direction>
Syntax: Bury <object name>
Dig is a skill which allows you to dig up
items that are buried OR dig out exits
which may exist. Please note that a shovel
will GREATLY improve your chances of finding
buried items.
Bury is a command which allows you to bury an
object. Be careful, You might not be able to
dig up the object later on.
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.manualDescription = "";

    if (Dig.instance === undefined) {
      Dig.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Dig {
    if (!Dig.instance) {
      Dig.instance = new Dig();
    }
    return Dig.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Dig.GetInstance() as T;
  }
}

export default Dig;
