import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Astrology from "@shared/types/ability-types/skills/Astrology";
import Enhancement from "@shared/types/ability-types/groups-spells/Enhancement";
import Detection from "../groups-spells/Detection";
import Combat from "../groups-spells/Combat";
import Transportation from "../groups-spells/Transportation";
import EnhancedEnchantment from "../groups-spells/EnhancedEnchantment";
import Protective from "../groups-spells/Protective";
import Beguiling from "../groups-spells/Beguiling";
import Enchantment from "../groups-spells/Enchantment";
import ServerCache from "@shared/cache/server-cache";

export class EnchantorDefault implements IAbilityGroup {
  static instance: EnchantorDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.EnchantorDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Enhancement.GetInstance().abilities,
      ...Detection.GetInstance().abilities,
      ...Combat.GetInstance().abilities,
      ...Transportation.GetInstance().abilities,
      ...EnhancedEnchantment.GetInstance().abilities,
      ...Protective.GetInstance().abilities,
      ...Beguiling.GetInstance().abilities,
      ...Enchantment.GetInstance().abilities,
      Astrology.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): EnchantorDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EnchantorDefault.GetInstance() as T;
  }
}

export default EnchantorDefault;
