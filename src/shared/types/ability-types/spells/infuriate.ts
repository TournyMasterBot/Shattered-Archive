import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Infuriate implements IAbility {
  private static instance: Infuriate;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Infuriate";
    this.helpFile = `INFURIATE

Syntax: cast 'infuriate' <target>

When cast upon a target, enrages them to focus their attack the battlemage. 
Very helpful in rescuing fellow magi.  
 
Groups containing this spell: Battlemagic
 
 
SEE ALSO:  BATTLEMAGE, BATTLEMAGIC
 
Updated 03.19.2021`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Infuriate.instance === undefined) {
      Infuriate.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Infuriate {
    if (!Infuriate.instance) {
      Infuriate.instance = new Infuriate();
    }
    return Infuriate.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Infuriate.GetInstance() as T;
  }
}

export default Infuriate;
