import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Parry from "@shared/types/ability-types/skills/parry";
import Daikyu from "@shared/types/ability-types/skills/daikyu";
import CallDog from "@shared/types/ability-types/skills/call-dog";
import Retainer from "@shared/types/ability-types/skills/retainer";
import Kiai from "@shared/types/ability-types/skills/kiai";
import Bushido from "@shared/types/ability-types/skills/bushido";
import Aikido from "@shared/types/ability-types/skills/aikido";

export class SamuraiDefault implements IAbilityGroup {
  static instance: SamuraiDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.SamuraiDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      Parry.GetInstance().Get(),
      Daikyu.GetInstance().Get(),
      CallDog.GetInstance().Get(),
      Retainer.GetInstance().Get(),
      Kiai.GetInstance().Get(),
      Bushido.GetInstance().Get(),
      Aikido.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): SamuraiDefault {
    if (!SamuraiDefault.instance) {
      SamuraiDefault.instance = new SamuraiDefault();
    }
    return SamuraiDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SamuraiDefault.GetInstance() as T;
  }
}

export default SamuraiDefault;
