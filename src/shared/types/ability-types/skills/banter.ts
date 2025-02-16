import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Banter implements IAbility {
  private static instance: Banter;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Banter";
    this.helpFile = `
BANTER

Syntax:  Banter

Once this has been set, it is a passive skill.

The ever flashy and frustrating swashbuckler has learned that battles are
fought not just with the blade, but with the mind. In a bid to turn this
against their enemy, the swashbuckler will stoop so low as to tease their
enemy in an attempt to throw off their concentration. Every time they do 
so, their foe will find their ability to hit lessened, building up each 
time so long as they stay in the fight.

Groups containing this skill: SWASHBUCKLER DEFAULT
        `;

    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;

    if (Banter.instance === undefined) {
      Banter.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Banter {
    if (!Banter.instance) {
      Banter.instance = new Banter();
    }
    return Banter.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Banter.GetInstance() as T;
  }
}

export default Banter;
