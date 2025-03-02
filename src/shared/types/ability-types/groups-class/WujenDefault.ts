import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Parry from "@shared/types/ability-types/skills/parry";
import Dodge from "@shared/types/ability-types/skills/dodge";
import Combat from "../groups-spells/Combat";
import Detection from "../groups-spells/Detection";
import Enhancement from "@shared/types/ability-types/groups-spells/Enhancement";
import Protective from "../groups-spells/Protective";
import Transportation from "../groups-spells/Transportation";
import ServerCache from "@shared/cache/server-cache";

export class WujenDefault implements IAbilityGroup {
  static instance: WujenDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.WujenDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Detection.GetInstance().abilities,
      ...Transportation.GetInstance().abilities,
      ...Protective.GetInstance().abilities,
      ...Combat.GetInstance().abilities,
      ...Enhancement.GetInstance().abilities,
      Parry.GetInstance(),
      Dodge.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): WujenDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WujenDefault.GetInstance() as T;
  }
}

export default WujenDefault;
